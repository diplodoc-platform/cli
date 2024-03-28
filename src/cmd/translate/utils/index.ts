import {ok} from 'assert';
import {basename, dirname, extname, resolve} from 'path';
import {readFileSync} from 'node:fs';
import glob from 'glob';

export {dumpFile, loadFile, resolveSchemas} from './fs';
export {extract, compose} from './translate';
export {TranslateError, LimitExceed, RequestError, AuthError} from './errors';

type TranslateArgs = {
    input: string;
    output?: string;
    source?: string;
    sourceLanguage?: string;
    sourceLanguageLocale?: string;
    target?: string;
    targetLanguage?: string;
    targetLanguageLocale?: string;
    auth?: string;
    folder?: string;
    glossary?: string;
    include?: string[] | string;
    exclude?: string[] | string;
    dryRun?: boolean;
    useSource?: boolean;
} & {
    [prop: string]: any;
};

export type TranslateParams = {
    input: string;
    output: string;
    source: [string, string];
    targets: [string, string][];
    auth?: string;
    folder?: string;
    glossary?: string;
    files: string[];
    dryRun: boolean;
    useSource: boolean;
};

export function normalizeParams(params: TranslateArgs, exts = EXTS): TranslateParams {
    const source = normalizeLocale(params, 'source')[0];
    const targets = normalizeLocale(params, 'target');
    const {input, files} = normalizeInput(params, source[0], exts);
    const {output, auth, folder, dryRun, useSource} = params;

    ok(input, 'Required param input is not configured');

    return {
        input,
        output: output || input,
        auth,
        folder,
        source,
        targets,
        files: [...new Set(files)],
        dryRun: Boolean(dryRun),
        useSource: Boolean(useSource),
    };
}

function normalizeLocale(params: TranslateArgs, scope: 'source' | 'target'): [string, string][] {
    const _scopeLanguage = params[scope + 'Language'];
    const _scopeLanguageLocale = params[scope + 'LanguageLocale'];
    const _scope = params[scope] || _scopeLanguageLocale || _scopeLanguage;

    if (!_scope) {
        return [['', '']];
    }

    if (Array.isArray(_scope)) {
        return _scope.map((_scope) => _scope.split('-'));
    }

    return [_scope.split('-') as [string, string]];
}

const EXTS = ['.md', '.yaml', '.json'];

function normalizeInput(params: TranslateArgs, language: string, exts: string[]) {
    let {input, include = [], exclude = []} = params;

    include = ([] as string[]).concat(include);
    exclude = ([] as string[]).concat(exclude);

    let files: string[] | null = null;
    if (extname(input) === '.list') {
        const list = readFileSync(input, 'utf8').split('\n');
        input = dirname(input);
        files = list.map((file) => {
            const absPath = resolve(input, file);

            if (!absPath.startsWith(input)) {
                throw new Error(`Insecure access to file out of project scope. (file: ${absPath})`);
            }

            if (!exts.includes(extname(file))) {
                throw new Error(`Unhandles file extension. (file: ${absPath})`);
            }

            return absPath;
        });
    } else {
        if (exts.includes(extname(input))) {
            files = [basename(input)];
            input = dirname(input);
        }

        if (!include.length) {
            include.push('...');
        }

        include = include.reduce((acc, item) => {
            if (item === '...') {
                acc.push(...exts.map((ext) => (language || '.') + '/**/*' + ext));
            } else {
                acc.push(item);
            }

            return acc;
        }, [] as string[]);

        files =
            files ||
            ([] as string[]).concat(
                ...include.map((match) =>
                    glob.sync(match, {
                        cwd: input,
                        ignore: exclude,
                        nodir: true,
                    }),
                ),
            );
    }

    return {input, files};
}

export class Defer<T = string> {
    resolve!: (text: T) => void;

    reject!: (error: any) => void;

    promise: Promise<T>;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}

export function bytes(texts: string[]) {
    return texts.reduce((sum, text) => sum + text.length, 0);
}
