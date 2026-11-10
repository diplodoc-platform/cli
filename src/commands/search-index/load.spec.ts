import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {loadIndexer} from './load';

describe('custom indexer resolution', () => {
    it('loads an installed ESM package using import conditions from the caller directory', async () => {
        const root = await mkdtemp(join(tmpdir(), 'diplodoc-indexer-'));
        try {
            const target = join(root, 'node_modules/custom-indexer');
            await mkdir(target, {recursive: true});
            await writeFile(
                join(target, 'package.json'),
                JSON.stringify({
                    name: 'custom-indexer',
                    type: 'module',
                    exports: {import: './index.js'},
                }),
            );
            await writeFile(
                join(target, 'index.js'),
                'export async function index(corpus) {return corpus.documents.length;}',
            );
            const indexer = await loadIndexer('custom-indexer', root);
            await expect(
                indexer.index({schemaVersion: 1, documents: []}, {indexName: 'docs'}),
            ).resolves.toBe(0);
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });

    it('loads local CommonJS modules and rejects invalid adapters', async () => {
        const root = await mkdtemp(join(tmpdir(), 'diplodoc-indexer-'));
        try {
            await writeFile(
                join(root, 'indexer.cjs'),
                'module.exports = {async index() {return 42;}};',
            );
            await writeFile(join(root, 'invalid.mjs'), 'export default {};');
            const indexer = await loadIndexer('./indexer.cjs', root);
            await expect(
                indexer.index({schemaVersion: 1, documents: []}, {indexName: 'docs'}),
            ).resolves.toBe(42);
            await expect(loadIndexer('./invalid.mjs', root)).rejects.toThrow('must export index');
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });
});
