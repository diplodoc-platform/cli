import {ok} from 'node:assert';
import {dirname, isAbsolute, relative, resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import glob from 'glob';
import {filter} from 'minimatch';
import {defined} from '~/config';

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
    ok(isAbsolute(scope), 'Scope should be absolute path');

    return paths.every((path) => resolve(scope, path).startsWith(scope));
}

export function resolveFiles(
    input: string,
    files: string | string[] | null,
    include: string[],
    exclude: string[],
    lang: string | null,
    exts: string[],
) {
    let result: string[];

    if (files) {
        if (typeof files === 'string') {
            files = [files];
        }

        result = files.reduce((acc, path) => {
            if (path.endsWith('.list')) {
                return acc.concat(resolveList(path, input));
            }

            return acc.concat(path);
        }, [] as string[]);
    } else {
        result = glob.sync(`**/*@(${exts.join('|')})`, {
            cwd: input,
            ignore: exclude,
            nodir: true,
        });

        // try to filter by target lang
        // but if result is empty we think that this is already land dir
        if (result.length && lang) {
            const langfiles = result.filter(filter(lang + '/**/*'));
            if (langfiles.length) {
                result = langfiles;
            }
        }

        if (include.length) {
            let matched: string[] = [];
            for (const pattern of include) {
                matched = matched.concat(result.filter(filter(pattern)));
            }

            result = matched;
        }
    }

    result = [...new Set(result)];

    // For security purpose.
    ok(pathsInScope(result, input), 'Insecure access to paths out of project scope!');

    return result;
}
