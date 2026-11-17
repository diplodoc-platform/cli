import type {Run} from '~/commands/build';

import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {load} from 'js-yaml';
import {afterEach, beforeEach, expect, test} from 'vitest';

import {prepareInput} from './index';

let input: AbsolutePath;
beforeEach(async () => {
    input = (await mkdtemp(join(tmpdir(), 'prepare-presets-'))) as AbsolutePath;
    await writeFile(
        join(input, 'presets.yaml'),
        'default: {name: original, nested: {old: true}}\ncloud: {product: cloud}',
    );
    await writeFile(join(input, 'prices.yaml'), 'ru: {price: 42, nested: {new: true}}');
    await writeFile(join(input, 'keys.yaml'), 'default: {name: final}\ncloud: {title: Cloud}');
});
afterEach(async () => {
    await rm(input, {recursive: true, force: true});
});

function run(
    sources: NonNullable<NonNullable<Run['config']['prepare']>['presets']>[number]['sources'],
) {
    return prepareInput({
        input,
        config: {outputFormat: 'md', prepare: {presets: [{to: 'presets.yaml', sources}]}},
    } as Run);
}

test('merges selected mappings and named presets in order without deep merging', async () => {
    await run([{from: 'prices.yaml', select: ['ru'], into: 'default'}, {from: 'keys.yaml'}]);
    expect(load(await readFile(join(input, 'presets.yaml'), 'utf8'))).toEqual({
        default: {name: 'final', price: 42, nested: {new: true}},
        cloud: {product: 'cloud', title: 'Cloud'},
    });
    expect(await readFile(join(input, 'prices.yaml'), 'utf8')).toBe(
        'ru: {price: 42, nested: {new: true}}',
    );
});

test('fails on a missing selection without overwriting the target', async () => {
    const before = await readFile(join(input, 'presets.yaml'), 'utf8');
    await expect(run([{from: 'prices.yaml', select: ['en'], into: 'default'}])).rejects.toThrow(
        'expected a YAML mapping',
    );
    expect(await readFile(join(input, 'presets.yaml'), 'utf8')).toBe(before);
});

test('fails on a missing source', async () => {
    await expect(run([{from: 'missing.yaml'}])).rejects.toThrow();
});

test.each(['md', 'html'] as const)('prepares files and presets for %s output', async (outputFormat) => {
    await writeFile(join(input, 'source.yaml'), 'title: Prepared');
    await writeFile(join(input, 'target.yaml'), 'title: Original');

    await prepareInput({
        input,
        config: {
            outputFormat,
            prepare: {
                moveFiles: [{from: 'source.yaml', to: 'target.yaml'}],
                presets: [{to: 'presets.yaml', sources: [{from: 'keys.yaml'}]}],
            },
        },
    } as Run);

    expect(await readFile(join(input, 'source.yaml'), 'utf8')).toBe('title: Prepared');
    expect(await readFile(join(input, 'target.yaml'), 'utf8')).toBe('title: Prepared');
    expect(load(await readFile(join(input, 'presets.yaml'), 'utf8'))).toEqual({
        default: {name: 'final', nested: {old: true}},
        cloud: {product: 'cloud', title: 'Cloud'},
    });
});
