import type {Config} from '~/core/config';

import {ok} from 'node:assert';
import {dirname, isAbsolute, relative, resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {globSync} from 'glob';
import {merge} from 'lodash';
import {filter} from 'minimatch';

import {configPath, defined, resolveConfig} from '~/core/config';

import {TranslateError} from './errors';

/**
 * Vars of one source file translated into a language: the presets of its
 * translation under `--vars`. Paths are relative to the input.
 */
export type VarsResolver = (path: string, targetLanguage: string) => Hash;

type PartialLocale = {
    language: string;
    locale?: string;
};

export type Locale = {
    language: string;
    locale: string;
};

type SourceLocaleConfig = {
    source?: string | PartialLocale;
    sourceLanguage?: string;
    sourceLanguageLocale?: string;
};

export function resolveSource(config: SourceLocaleConfig, args: SourceLocaleConfig): Locale {
    const value = defined('source', args, config);
    if (value) {
        ok(
            typeof value === 'string' || (typeof value === 'object' && value.language),
            `Field 'source' should be string or locale.`,
        );

        return parseLocale(value);
    }

    return {language: '', locale: ''};
}

type TargetLocaleConfig = {
    target?: string | PartialLocale | (string | PartialLocale)[];
    targetLanguage?: string | string[];
    targetLanguageLocale?: string | string[];
};

export function resolveTargets(config: TargetLocaleConfig, args: TargetLocaleConfig) {
    const value = defined('target', args, config);

    if (value) {
        ok(
            ['string', 'object'].includes(typeof value) || Array.isArray(value),
            `Field 'target' should be string, locale or array.`,
        );

        if (Array.isArray(value)) {
            return value.map(parseLocale);
        } else {
            return [parseLocale(value)];
        }
    }

    return [{language: '', locale: ''}];
}

function parseLocale(raw: string | Locale) {
    if (typeof raw === 'object') {
        raw.locale = raw.locale || '';

        return raw;
    }

    const [language, locale = ''] = raw.split('-');

    return {language, locale};
}

function resolveList(path: string, scope: string) {
    const dir = dirname(path);
    const list = readFileSync(path, 'utf8')
        .split('\n')
        // Remove comments
        .filter((line) => !line.match(/^#/))
        // Remove empty lines
        .filter(Boolean);

    return list.map((file) => relative(scope, resolve(dir, file)));
}

function pathsInScope(paths: string[], scope: string) {
    ok(isAbsolute(scope), `Scope should be absolute path. (${scope})`);

    return paths.every((path) => resolve(scope, path).startsWith(scope));
}

export function resolveFiles(
    input: string,
    files: string | string[] | null,
    include: string[],
    exclude: string[],
    lang: string | null,
    exts: string[],
    tocEntries?: string[] | null,
) {
    let result: string[];
    let skipped: [string, string][] = [];

    const extmatch = '**/*@(' + exts.map((ext) => '*' + ext).join('|') + ')';

    if (files && files.length > 0) {
        if (typeof files === 'string') {
            files = [files];
        }

        result = files.reduce((acc, path) => {
            if (path.endsWith('.list')) {
                return acc.concat(resolveList(path, input).filter(filter(extmatch)));
            }

            return acc.concat(path);
        }, [] as string[]);
    } else {
        result = tocEntries
            ? tocEntries
            : globSync(extmatch, {
                  cwd: input,
                  nodir: true,
                  ignore: ['node_modules/**', '*/node_modules/**'],
              });

        if (exclude.length) {
            [result, skipped] = skip(result, skipped, exclude, 'exclude');
        }

        // try to filter by target lang
        // but if result is empty we think that this is already land dir
        if (result.length && lang) {
            const [langfiles, rest] = skip(result, [], lang + '/**/*', 'language', true);

            if (langfiles.length) {
                result = langfiles;
                skipped.push(...rest);
            }
        }

        if (include.length) {
            [result, skipped] = skip(result, skipped, include, 'include', true);
        }
    }

    result = [...new Set(result)];

    // For security purpose.
    ok(pathsInScope(result, input), `Insecure access to paths out of project scope (${result})!`);

    return [result, skipped] as [string[], [string, string][]];
}

export function resolveVars(config: {vars?: Hash}, args: {vars?: Hash}) {
    return merge(config.vars || {}, args.vars);
}

/**
 * Vars preset of a run: the argument, then the `sections` of the .yfm in
 * order - the command's own section first, then the enclosing ones, the
 * empty name being the file root, where build keeps `varsPreset` - then
 * `default`. Sections are read from the file itself, not from the resolved
 * config: that one already carries `default` from the config defaults, so
 * a section could not select `default` over a root preset through it.
 */
export async function resolveVarsPreset(
    config: Config<Hash>,
    args: Hash,
    sections: string[] = [''],
): Promise<string> {
    const argument = defined('varsPreset', args);
    if (argument) {
        return argument;
    }

    return (await sectionValue<string>(config, args, sections, 'varsPreset')) || 'default';
}

/**
 * The first value of `key` in the `sections` of the .yfm, in order; the
 * empty name is the file root. Reads the file itself, so a command whose
 * own section is missing (`translate.seed` in a .yfm with only `translate`)
 * still sees the enclosing sections.
 */
export async function sectionValue<T>(
    config: Config<Hash>,
    args: Hash,
    sections: string[],
    key: string,
): Promise<T | undefined> {
    // A .yfm without the command's section resolves to the defaults and
    // loses its path; the file is still there, so it is located again the
    // way the program does.
    const path = config[configPath] || configFile(args);
    if (!path) {
        return undefined;
    }

    const root: Hash = await resolveConfig(path, {fallback: {}});

    for (const name of sections) {
        const value = sectionOf(root, name)?.[key];

        if (value !== undefined && value !== null) {
            return value;
        }
    }

    return undefined;
}

/** A nested section of a config by dotted name; undefined when missing. `''` is the root. */
function sectionOf(root: Hash, name: string): Hash | undefined {
    let current: Hash | undefined = root;

    for (const part of name ? name.split('.') : []) {
        if (!current || typeof current !== 'object' || !(part in current)) {
            return undefined;
        }

        current = current[part];
    }

    return current;
}

function configFile(args: {input?: string; config?: string}): AbsolutePath | undefined {
    const {input, config} = args;

    if (!config) {
        return undefined;
    }

    // `./x` and `../x` are relative to the cwd, a bare name (`.yfm`) to the input.
    if (isAbsolute(config) || /^\.\.?[\\/]/.test(config)) {
        return resolve(config) as AbsolutePath;
    }

    return resolve(input || '.', config) as AbsolutePath;
}

function skip(
    array: string[],
    skipped: [string, string][],
    pattern: string | string[],
    reason: string,
    negate = false,
) {
    const patterns = ([] as string[]).concat(pattern).map((pattern) => filter(pattern));
    const match = (value: string) => {
        const matched = patterns.some((match) => match(value));

        return negate ? !matched : matched;
    };

    return array.reduce(
        ([left, right], value) => {
            if (match(value)) {
                right.push([reason, value]);
            } else {
                left.push(value);
            }

            return [left, right] as [string[], [string, string][]];
        },
        [[], skipped] as [string[], [string, string][]],
    );
}

/**
 * How much of fenced code blocks goes to translation, see `--code`.
 * Mirrors the `code` option of @diplodoc/translation.
 */
export type CodeMode = 'no' | 'all' | 'precise' | 'adaptive';

export const CODE_MODES: CodeMode[] = ['no', 'all', 'precise', 'adaptive'];

/**
 * Reads the code mode from args or config and validates it.
 * Returns undefined when unset, so that each provider applies its own default.
 */
export function resolveCodeMode(args: Hash, config: Hash): CodeMode | undefined {
    const value = defined('code', args, config) as CodeMode | undefined;

    if (value === undefined || value === null) {
        return undefined;
    }

    if (!CODE_MODES.includes(value)) {
        throw new TranslateError(
            `Unknown code mode "${value}", expected one of: ${CODE_MODES.join(', ')}`,
            'CONFIG',
        );
    }

    return value;
}

export function configDefaults() {
    return {
        dryRun: false,
        varsPreset: 'default',
        ignore: [],
        ignoreStage: [],
        vars: {},
        rawAddMeta: false,
        addSystemMeta: false,
        addResourcesMeta: true,
        addMetadataMeta: true,
        addAlternateMeta: true,
        template: {
            enabled: true,
            keepNotVar: false,
            legacyConditions: false,
            features: {
                conditions: 'strict' as const,
                substitutions: false,
            },
            scopes: {
                code: false,
                text: false,
            },
        },
        removeHiddenTocItems: false,
        removeEmptyTocItems: false,
        outputFormat: 'md' as 'md' | 'html',
        // TODO: delete after MarkdownService redundant types delete
        allowHtml: true,
        sanitizeHtml: false,
        lang: 'en',
        langs: ['en'],
        vcsPath: {enabled: true},
    };
}

export type ConfigDefaults = ReturnType<typeof configDefaults>;
