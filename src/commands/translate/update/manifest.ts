import {ok} from 'node:assert';
import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';

import {planOpenapi} from './openapi';
import {planText} from './text';

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function relativeFile(value: unknown): asserts value is string {
    ok(
        typeof value === 'string' &&
            // Reject control characters in filesystem paths.
            // eslint-disable-next-line no-control-regex
            !/[:\\\x00-\x1f]/.test(value) &&
            value.split('/').every((part) => part && part !== '.' && part !== '..'),
        'Expected a relative file path within the source tree',
    );
}

function snapshot(value: unknown) {
    ok(record(value), 'Expected an OpenAPI snapshot keyed by relative file path');
    const result = new Map<string, string>();
    for (const [file, content] of Object.entries(value)) {
        relativeFile(file);
        ok(typeof content === 'string', 'Expected file contents in the snapshot');
        result.set(file, content);
    }
    return result;
}

export async function readUpdate(
    path: AbsolutePath,
    source: string,
    targetLanguage: string,
    checkDestinations: (file: string) => Promise<void>,
) {
    const data: unknown = JSON.parse(await readFile(path, 'utf8'));
    ok(record(data) && data.version === 1, 'Unsupported source update manifest version');
    const {file, kind, before, after, current, target} = data;
    relativeFile(file);
    await checkDestinations(file);
    if (kind === 'openapi') {
        ok(
            /\.ya?ml$/i.test(file) && typeof target === 'string',
            'Expected a localized YAML bundle',
        );
        const plan = planOpenapi(
            file,
            snapshot(before),
            snapshot(after),
            snapshot(current),
            target,
            source,
            targetLanguage,
        );
        return {file, kind, plan, target, payloadFile: 'fragments.md'} as const;
    }
    ok(kind === 'markdown' || kind === 'toc', 'Unknown source update kind');
    ok(
        kind === 'toc' ? basename(file) === 'toc.yaml' : file.endsWith('.md'),
        'Source update kind does not match its file',
    );
    ok(
        typeof after === 'string' &&
            (before === null || typeof before === 'string') &&
            (target === null || typeof target === 'string'),
        'Expected source and translation contents in update manifest',
    );
    return {
        file,
        kind,
        plan: planText(kind, before, after, target),
        target,
        payloadFile: file,
    } as const;
}
