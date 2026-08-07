import type {AjvOptions, JSONObject, LinkedJSONObject} from '@diplodoc/translation';

import {copyFileSync, existsSync, mkdirSync} from 'node:fs';
import {dirname, extname, join, resolve} from 'node:path';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {globSync} from 'glob';
import {load} from 'js-yaml';
import {stringify} from 'yaml';
import {linkRefs, unlinkRefs} from '@diplodoc/translation';
import {
    leadingSchemaJson,
    pageConstructorSchemaJson,
    presetsSchemaJson,
    tocSchemaJson,
} from '@diplodoc/ajv';

import {normalizePath} from '~/core/utils';

const TRANSLATABLE_EXTENSIONS = ['.md', '.yaml'];

type AssetsConfig = {
    input: string;
    output: string;
    source: {language: string};
    target: {language: string}[];
};

/**
 * Copies non-translatable files (images and other assets) from the source
 * language directory to the target language directories in the output,
 * so the translated file set is buildable on its own.
 *
 * Returns the number of copied files.
 */
export function copyAssets(config: AssetsConfig): number {
    const from = resolve(config.input, config.source.language);
    if (!existsSync(from)) {
        return 0;
    }

    const assets = globSync('**/*', {cwd: from, nodir: true}).filter(
        (file) => !TRANSLATABLE_EXTENSIONS.includes(extname(file)),
    );

    let copied = 0;
    for (const target of config.target) {
        const to = resolve(config.output, target.language);
        for (const asset of assets) {
            const dest = join(to, asset);
            mkdirSync(dirname(dest), {recursive: true});
            copyFileSync(join(from, asset), dest);
            copied++;
        }
    }

    return copied;
}

function last<T>(array: T[]): T | undefined {
    return array[array.length - 1];
}

function ext(path: string) {
    const parts = path.split('.');

    if (last(parts) === 'skl') {
        parts.pop();
    }

    return last(parts);
}

function parseFile(text: string, path: string): JSONObject | string {
    switch (ext(path)) {
        case 'yaml':
            return load(text) as JSONObject;
        case 'json':
            return JSON.parse(text);
        default:
            return text;
    }
}

function stringifyFile(content: JSONObject | string, path: string): string {
    if (typeof content === 'string') {
        return content;
    }

    switch (ext(path)) {
        case 'yaml':
            return stringify(
                content as Record<string, unknown>,
                (_key, value) => {
                    if (typeof value === 'string') {
                        return value.replace(/[ \t]+$/, '');
                    }
                    return value;
                },
                {
                    aliasDuplicateObjects: false,
                    lineWidth: 0,
                    singleQuote: true,
                },
            );
        case 'json':
            return JSON.stringify(content);
        default:
            return content as unknown as string;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isObject(object: any): object is JSONObject {
    return object && typeof object === 'object';
}

export class FileLoader<T = string | JSONObject> {
    get data(): T {
        if (this._data === null) {
            throw new Error(`File content for ${this.path} is not loaded`);
        }

        return this._data;
    }

    get isString() {
        return typeof this.data === 'string';
    }

    get isObject() {
        return typeof this.data === 'object';
    }

    private _data: T | null = null;

    private parts: Record<string, T> = {};

    private path: AbsolutePath;

    private resolveRefs: boolean;

    constructor(path: AbsolutePath, resolveRefs = true) {
        this.path = path;
        this.resolveRefs = resolveRefs;
    }

    set(data: T) {
        this._data = data;
        this.parts[this.path] = this._data;

        return this;
    }

    async load() {
        const load = async (path: AbsolutePath, resolveRefs: boolean) => {
            if (!this.parts[path]) {
                const text = await readFile(path, 'utf8');
                const content = (this.parts[path] = parseFile(text, path) as T);

                if (isObject(content) && resolveRefs) {
                    await linkRefs(content, path, async (ref) => {
                        if (!this.parts[ref]) {
                            this.parts[ref] = await load(ref as AbsolutePath, false);
                        }

                        return this.parts[ref] as JSONObject;
                    });
                }
            }

            return this.parts[path] as T;
        };

        if (!this._data) {
            this._data = await load(this.path, this.resolveRefs);
        }

        return this._data;
    }

    async dump(repath = (path: string) => path) {
        for (const path of Object.keys(this.parts)) {
            if (this.isObject && this.resolveRefs) {
                await unlinkRefs(this.parts[path] as LinkedJSONObject);
            }

            const output = repath(path);
            const text = this.isString
                ? (this.parts[path] as string)
                : stringifyFile(this.parts[path] as JSONObject, path);

            await mkdir(dirname(output), {recursive: true});
            await writeFile(output, text, 'utf8');
        }
    }
}

/**
 * Builds the repath function for FileLoader.dump: maps an absolute input
 * path into the output root, swapping the source language path segment
 * for the target one. Dump passes os-dependent separators - normalize
 * to posix before the language swap.
 */
export function languageRepath(params: {
    inputRoot: string;
    outputRoot: string;
    sourceLanguage: string;
    targetLanguage: string;
}) {
    const {inputRoot, outputRoot, sourceLanguage, targetLanguage} = params;

    return (path: string) =>
        join(
            outputRoot,
            normalizePath(path.replace(inputRoot, '')).replace(
                '/' + sourceLanguage + '/',
                '/' + targetLanguage + '/',
            ),
        );
}

async function loadFile<T = string | JSONObject>(path: AbsolutePath): Promise<T> {
    return parseFile(await readFile(path, 'utf8'), path) as T;
}

/**
 * Takes toc schema if file matched as toc.
 * Takes leading schema if file matched as leading page.
 * Takes presets schema if file matched as presets.
 * Any way translation inner logic will search `$schema` attribute with high priority.
 * If `$schema` attribute not found anc precise schema not resolved,
 * we think that current yaml is a part of complex toc.yaml
 */
export async function resolveSchemas({
    content,
    path,
    customSchemaPath,
}: {
    content: string | JSONObject;
    path: string;
    customSchemaPath?: string[];
}) {
    const result: {schemas: JSONObject[]; ajvOptions?: AjvOptions} = {
        schemas: [],
    };

    if (typeof content === 'object' && content?.blocks) {
        result.schemas.push(pageConstructorSchemaJson as JSONObject);
        result.ajvOptions = {
            keywords: ['select'],
            extendWithSchemas: [],
        };
    }

    if (path.endsWith('toc.yaml')) {
        result.schemas.push(tocSchemaJson as JSONObject);
    }

    if (path.endsWith('index.yaml')) {
        result.schemas.push(leadingSchemaJson as JSONObject);
    }

    if (path.endsWith('presets.yaml')) {
        result.schemas.push(presetsSchemaJson as JSONObject);
    }

    if (path.endsWith('redirects.yaml')) {
        result.schemas = [];
    } else {
        result.schemas.push(tocSchemaJson as JSONObject);
    }

    if (customSchemaPath?.length) {
        for (const path of customSchemaPath) {
            result.schemas.push(await loadFile(resolve(path)));
        }
    }

    return result;
}
