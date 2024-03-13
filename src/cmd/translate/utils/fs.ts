import {JSONValue, resolveRefs} from '@diplodoc/translation';
import {dump, load} from 'js-yaml';
import {readFile, writeFile} from 'fs/promises';

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

function parseFile(text: string, path: string): JSONValue | string {
    if (typeof text !== 'string') {
        return text;
    }

    switch (ext(path)) {
        case 'yaml':
            return load(text) as object;
        case 'json':
            return JSON.parse(text);
        default:
            return text;
    }
}

function stringifyFile(content: JSONValue | string, path: string): string {
    if (typeof content === 'string') {
        return content;
    }

    switch (ext(path)) {
        case 'yaml':
            return dump(content);
        case 'json':
            return JSON.stringify(content);
        default:
            return content as unknown as string;
    }
}

export async function loadFile<T = string | JSONValue>(path: string, resolve = true): Promise<T> {
    const text = await readFile(path, 'utf8');

    let content = parseFile(text, path);

    if (content && typeof content === 'object' && resolve) {
        content = await resolveRefs(content, path, parseFile);
    }

    return content as T;
}

export async function dumpFile(path: string, content: string | JSONValue) {
    const text = stringifyFile(content, path);

    await writeFile(path, text, 'utf8');
}

/**
 * Takes toc schema if file matched as toc.
 * Takes leading schema if file matched as leading page.
 * Takes presets schema if file matched as presets.
 * Any way translation inner logic will search `$schema` attribute with high priority.
 * If `$schema` attribute not found anc precise schema not resolved,
 * we think that current yaml is a part of complex toc.yaml
 */
export async function resolveSchemas(path: string) {
    if (path.endsWith('toc.yaml')) {
        return [await loadFile('schemas/toc-schema.yaml', false)];
    }

    if (path.endsWith('index.yaml')) {
        return [await loadFile('schemas/leading-schema.yaml', false)];
    }

    if (path.endsWith('presets.yaml')) {
        return [await loadFile('schemas/presets-schema.yaml', false)];
    }

    return [await loadFile('schemas/toc-schema.yaml', false)];
}
