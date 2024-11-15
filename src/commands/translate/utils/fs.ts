import type {JSONObject, LinkedJSONObject} from '@diplodoc/translation';
import {dirname, join, resolve} from 'node:path';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dump, load} from 'js-yaml';
import {linkRefs, unlinkRefs} from '@diplodoc/translation';

const ROOT = dirname(require.resolve('@diplodoc/cli/package'));

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
            return dump(content, {noRefs: true});
        case 'json':
            return JSON.stringify(content);
        default:
            return content as unknown as string;
    }
}

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

    private path: string;

    private resolveRefs: boolean;

    constructor(path: string, resolveRefs = true) {
        this.path = path;
        this.resolveRefs = resolveRefs;
    }

    set(data: T) {
        this._data = data;
        this.parts[this.path] = this._data;

        return this;
    }

    async load() {
        const load = async (path: string, resolveRefs: boolean) => {
            path = resolve(path);

            if (!this.parts[path]) {
                const text = await readFile(path, 'utf8');
                const content = (this.parts[path] = parseFile(text, path) as T);

                if (isObject(content) && resolveRefs) {
                    await linkRefs(content, path, async (path: string) => {
                        if (!this.parts[path]) {
                            this.parts[path] = await load(path, false);
                        }

                        return this.parts[path] as JSONObject;
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

async function loadFile<T = string | JSONObject>(path: string): Promise<T> {
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
}: {
    content: string | JSONObject;
    path: string;
}) {
    if (typeof content === 'object' && content?.blocks) {
        return {
            schemas: [await loadFile(join(ROOT, 'schemas/page-constructor-schema.yaml'))],
            ajvOptions: {
                keywords: 'select',
                extendWithSchemas: [],
            },
        };
    }

    if (path.endsWith('toc.yaml')) {
        return {schemas: [await loadFile(join(ROOT, 'schemas/toc-schema.yaml'))]};
    }

    if (path.endsWith('index.yaml')) {
        return {schemas: [await loadFile(join(ROOT, 'schemas/leading-schema.yaml'))]};
    }

    if (path.endsWith('presets.yaml')) {
        return {schemas: [await loadFile(join(ROOT, 'schemas/presets-schema.yaml'))]};
    }

    if (path.endsWith('redirects.yaml')) {
        return {schemas: []};
    }

    return {schemas: [await loadFile(join(ROOT, 'schemas/toc-schema.yaml'))]};
}
