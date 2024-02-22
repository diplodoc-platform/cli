import {JSONValue, resolveRefs} from '@diplodoc/translation';
import {extname} from 'path';
import {dump, load} from 'js-yaml';
import {readFile, writeFile} from 'fs/promises';

function parseFile(text: string, path: string): JSONValue | string {
    if (typeof text !== 'string') {
        return text;
    }

    switch (extname(path)) {
        case '.yaml':
            return load(text) as object;
        case '.json':
            return JSON.parse(text);
        default:
            return text;
    }
}

function stringifyFile(content: JSONValue | string, path: string): string {
    if (typeof content === 'string') {
        return content;
    }

    switch (extname(path)) {
        case '.yaml':
            return dump(content);
        case '.json':
            return JSON.stringify(content);
        default:
            return content as unknown as string;
    }
}

export async function loadFile<T = string | JSONValue>(path: string): Promise<T> {
    const text = await readFile(path, 'utf8');

    let content = parseFile(text, path);

    if (content && typeof content === 'object') {
        content = await resolveRefs(content, path, parseFile);
    }

    return content as T;
}

export async function dumpFile(path: string, content: string | JSONValue) {
    const text = stringifyFile(content, path);

    await writeFile(path, text, 'utf8');
}
