import {describe, expect, it} from 'vitest';

import {BuildManifest} from './index';

describe('Build manifest feature', () => {
    describe('shouldReplaceFile method', () => {
        it('should prioritize .md files over .yaml files', () => {
            const buildManifest = new BuildManifest();
            // @ts-ignore - accessing private method for testing
            const shouldReplace = buildManifest.shouldReplaceFile('.yaml', '.md');

            expect(shouldReplace).toBe(true);
        });

        it('should prioritize .md files over .yml files', () => {
            const buildManifest = new BuildManifest();
            // @ts-ignore - accessing private method for testing
            const shouldReplace = buildManifest.shouldReplaceFile('.yml', '.md');

            expect(shouldReplace).toBe(true);
        });

        it('should prioritize .yaml files over .html files', () => {
            const buildManifest = new BuildManifest();
            // @ts-ignore - accessing private method for testing
            const shouldReplace = buildManifest.shouldReplaceFile('.html', '.yaml');

            expect(shouldReplace).toBe(true);
        });

        it('should prioritize .yml files over .html files', () => {
            const buildManifest = new BuildManifest();
            // @ts-ignore - accessing private method for testing
            const shouldReplace = buildManifest.shouldReplaceFile('.html', '.yml');

            expect(shouldReplace).toBe(true);
        });

        it('should not replace when new file has lower priority', () => {
            const buildManifest = new BuildManifest();
            // @ts-ignore - accessing private method for testing
            const shouldReplace = buildManifest.shouldReplaceFile('.md', '.yaml');

            expect(shouldReplace).toBe(false);
        });

        it('should handle unknown extensions with priority 0', () => {
            const buildManifest = new BuildManifest();
            // @ts-ignore - accessing private method for testing
            const shouldReplace = buildManifest.shouldReplaceFile('.unknown', '.custom');

            expect(shouldReplace).toBe(false);
        });
    });

    describe('collectOpenapiCompanions method', () => {
        const collect = (openapiCompanions: unknown) => {
            const buildManifest = new BuildManifest();
            // @ts-ignore - accessing private method for testing
            return buildManifest.collectOpenapiCompanions({openapiCompanions});
        };

        it('returns an empty array when nothing was registered', () => {
            expect(collect(undefined)).toEqual([]);
            expect(collect([])).toEqual([]);
        });

        it('deduplicates by companion path and sorts deterministically', () => {
            const result = collect([
                {leadingPage: 'ru/b/index', companionPath: 'ru/b/index.openapi.json'},
                {leadingPage: 'ru/a/index', companionPath: 'ru/a/index.openapi.json'},
                {leadingPage: 'ru/a/index', companionPath: 'ru/a/index.openapi.json'},
            ]);

            expect(result).toEqual([
                {leadingPage: 'ru/a/index', companionPath: 'ru/a/index.openapi.json'},
                {leadingPage: 'ru/b/index', companionPath: 'ru/b/index.openapi.json'},
            ]);
        });
    });

    describe('collectRestrictedAccess method', () => {
        const collect = async (
            entries: string[],
            dumpByPath: Record<string, Record<string, unknown>>,
        ) => {
            const buildManifest = new BuildManifest();
            const run = {
                toc: {entries},
                meta: {
                    dump: async (path: string) => dumpByPath[path] ?? {},
                },
            };

            // @ts-ignore - accessing private method for testing
            return buildManifest.collectRestrictedAccess(run);
        };

        it('returns an empty map when no entries have restricted-access', async () => {
            const result = await collect(['index.md', 'guide.md'], {
                'index.md': {title: 'Home'},
                'guide.md': {},
            });

            expect(result).toEqual({});
        });

        it('maps paths without extension and sorts keys deterministically', async () => {
            const result = await collect(['plugins/index2.md', 'index.md', 'plugins/index4.md'], {
                'index.md': {'restricted-access': [['admin']]},
                'plugins/index2.md': {
                    'restricted-access': [['admin'], ['admin', 'user']],
                },
                'plugins/index4.md': {
                    'restricted-access': [['admin'], ['customInFile']],
                },
            });

            expect(result).toEqual({
                index: [['admin']],
                'plugins/index2': [['admin'], ['admin', 'user']],
                'plugins/index4': [['admin'], ['customInFile']],
            });
        });

        it('skips entries with empty restricted-access arrays', async () => {
            const result = await collect(['index.md', 'open.md'], {
                'index.md': {'restricted-access': []},
                'open.md': {},
            });

            expect(result).toEqual({});
        });
    });

    describe('buildFileTrie method', () => {
        const createRun = (entries: string[]) =>
            ({
                toc: {
                    tocs: [{path: 'toc.yaml'}],
                    entries,
                    for: () => ({path: 'toc.yaml'}),
                },
                logger: {warn: () => {}},
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }) as any;

        const buildTrie = (entries: string[]) => {
            const buildManifest = new BuildManifest();
            // @ts-ignore - accessing private method for testing
            return buildManifest.buildFileTrie(createRun(entries));
        };

        it('should keep path segments that collide with Object.prototype members', () => {
            const {trie} = buildTrie([
                'lab/constructor/restrictions.md',
                'lab/constructor/conditions/yt-table.md',
                'lab/segments.md',
            ]);

            expect(trie.lab?.children?.['constructor']?.children?.restrictions?.file).toEqual({
                ext: '.md',
                toc: 't0',
            });
            expect(
                trie.lab?.children?.['constructor']?.children?.conditions?.children?.['yt-table']
                    ?.file,
            ).toEqual({ext: '.md', toc: 't0'});
        });

        it('should not lose Object.prototype-like segments after JSON serialization', () => {
            const dangerousSegments = ['constructor', 'toString', 'valueOf', 'hasOwnProperty'];
            const entries = dangerousSegments.map((segment) => `lab/${segment}/page.md`);

            const {trie} = buildTrie(entries);
            const roundTripped = JSON.parse(JSON.stringify({trie})).trie;

            for (const segment of dangerousSegments) {
                expect(
                    roundTripped.lab?.children?.[segment]?.children?.page?.file,
                    `segment "${segment}" must survive JSON.stringify`,
                ).toEqual({ext: '.md', toc: 't0'});
            }
        });
    });
});
