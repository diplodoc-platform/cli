import {ok} from 'node:assert';
import {dirname, isAbsolute, relative, resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {globSync} from 'glob';
import {merge} from 'lodash';
import {filter} from 'minimatch';

import {defined} from '~/core/config';

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

function skip(
    array: string[],
    skipped: [string, string][],
    pattern: string | string[],
    reason: string,
    negate = false,
) {
    const mode = (value: boolean) => (negate ? !value : value);
    const patterns = ([] as string[]).concat(pattern).map((pattern) => filter(pattern));
    const match = (value: string) => patterns.some((match) => mode(match(value)));

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
        template: {
            enabled: true,
            keepNotVar: false,
            legacyConditions: false,
            features: {
                conditions: 'strict',
                substitutions: true,
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
