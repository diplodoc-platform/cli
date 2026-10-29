import type {BuildConfig, EntryData, EntryInfo} from '~/commands/build';

import {describe, expect, it, vi} from 'vitest';

import {Build, getHooks as getBuildHooks} from '~/commands/build';
import {VFile, normalizePath} from '~/core/utils';

import {setupRun} from '../../__tests__';
import {getHooks as getEntryHooks} from '../../services/entry';

import {BuildManifest} from './index';

type TestableBuildManifest = {
    resolveEnabled(configValue: unknown, argumentValue: unknown): boolean;
};

describe('Build manifest feature', () => {
    describe('worker modification timestamps', () => {
        it.each([
            ['2026-03-20T12:00:00.000Z', {guide: '2026-03-20T12:00:00.000Z'}],
            [undefined, {}],
            ['invalid', {}],
        ] as const)(
            'uses the finalized worker timestamp %s instead of stale main-thread metadata',
            async (updatedAt, expected) => {
                const main = new Build();
                const worker = new Build();
                const feature = new BuildManifest();
                feature.apply(main);
                new BuildManifest().apply(worker);
                const config = {buildManifest: true, mtimes: {enabled: true}};
                const mainRun = setupRun(config as BuildConfig);
                const workerRun = setupRun(config as BuildConfig);
                const path = normalizePath('guide.md');
                vi.spyOn(mainRun.toc, 'entries', 'get').mockReturnValue([path]);
                const dump = vi.spyOn(mainRun.meta, 'dump').mockResolvedValue({
                    updatedAt: '2026-01-10T12:00:00.000Z',
                    'restricted-access': [['admin']],
                });

                await getBuildHooks(main).BeforeRun.for('md').promise(mainRun);
                await getBuildHooks(worker).BeforeRun.for('md').promise(workerRun);
                const entry = new VFile<EntryData>(path, {meta: {updatedAt}} as EntryData);
                await getEntryHooks(workerRun.entry).Dump.promise(entry);
                const transferred = structuredClone(entry.info);
                expect(transferred).toEqual({pageModifiedTime: updatedAt});
                await getBuildHooks(main)
                    .Entry.for('md')
                    .promise(mainRun, path, transferred as EntryInfo);

                // @ts-ignore - accessing private method for testing
                const result = await feature.collectPageMetadata(mainRun);
                expect(result.pageModifiedTimes).toEqual(expected);
                expect(result.restrictedAccess).toEqual({guide: [['admin']]});
                expect(dump).toHaveBeenCalledExactlyOnceWith(path);
            },
        );

        it.each([
            {buildManifest: false, mtimes: {enabled: true}},
            {buildManifest: true, mtimes: {enabled: false}},
        ])('does not transfer timestamps when disabled: %j', async (config) => {
            const build = new Build();
            new BuildManifest().apply(build);
            const run = setupRun(config as BuildConfig);

            await getBuildHooks(build).BeforeRun.for('md').promise(run);

            expect(getEntryHooks(run.entry).Dump.taps).toHaveLength(0);
        });
    });

    describe('resolveEnabled method', () => {
        const resolveEnabled = (configValue?: boolean, argumentValue?: boolean) =>
            (new BuildManifest() as unknown as TestableBuildManifest).resolveEnabled(
                configValue,
                argumentValue,
            );

        it('should enable the manifest by default', () => {
            expect(resolveEnabled()).toBe(true);
        });

        it('should respect the config value', () => {
            expect(resolveEnabled(false)).toBe(false);
            expect(resolveEnabled(true)).toBe(true);
        });

        it('should let an explicit CLI flag override the config value', () => {
            expect(resolveEnabled(false, true)).toBe(true);
            expect(resolveEnabled(true, false)).toBe(false);
        });
    });

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

    describe('collectPageMetadata access rules', () => {
        const collect = async (
            entries: string[],
            dumpByPath: Record<string, Record<string, unknown>>,
        ) => {
            const buildManifest = new BuildManifest();
            const run = {
                toc: {entries},
                config: {mtimes: {enabled: false}},
                meta: {
                    dump: async (path: string) => dumpByPath[path] ?? {},
                },
            };

            // @ts-ignore - accessing private method for testing
            return (await buildManifest.collectPageMetadata(run)).restrictedAccess;
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

    describe('page modification dates', () => {
        const collect = async (
            enabled: boolean,
            metadata: Record<string, Record<string, unknown>>,
        ) => {
            const dump = vi.fn(async (path: string) => metadata[path]);
            const run = {
                config: {mtimes: {enabled}},
                toc: {entries: Object.keys(metadata)},
                meta: {dump},
            };
            // @ts-ignore - accessing private method for testing
            const result = await new BuildManifest().collectPageMetadata(run);
            return {result, dump};
        };

        it('collects dates and access rules with one metadata read per entry', async () => {
            const {result, dump} = await collect(true, {
                'ru/v1.0/index.md': {
                    updatedAt: '2026-10-20T12:00:00+03:00',
                },
                'en/landing.yaml': {
                    updatedAt: '2026-10-21T00:00:00Z',
                    'restricted-access': [['admin']],
                },
                'undated.md': {},
                'invalid.md': {updatedAt: 'invalid'},
            });

            expect(result.pageModifiedTimes).toEqual({
                'ru/v1.0/index': '2026-10-20T09:00:00.000Z',
                'en/landing': '2026-10-21T00:00:00.000Z',
            });
            expect(result.restrictedAccess).toEqual({'en/landing': [['admin']]});
            expect(dump).toHaveBeenCalledTimes(4);
        });

        it('omits the date map when mtimes is disabled, even for authored metadata', async () => {
            const {result} = await collect(false, {
                'index.md': {updatedAt: '2026-10-20T00:00:00Z'},
            });
            expect(result).not.toHaveProperty('pageModifiedTimes');
        });

        it('emits an empty date map when mtimes is enabled but no dates are available', async () => {
            const {result} = await collect(true, {'index.md': {}});
            expect(result.pageModifiedTimes).toEqual({});
        });

        it.each([false, true])(
            'follows the trie source priority (reversed=%s)',
            async (reversed) => {
                const entries = [
                    ['index.yaml', {updatedAt: '2026-10-21T00:00:00Z'}],
                    ['index.md', {updatedAt: '2026-10-20T00:00:00Z'}],
                ];
                const {result} = await collect(
                    true,
                    Object.fromEntries(reversed ? entries.reverse() : entries),
                );
                expect(result.pageModifiedTimes).toEqual({index: '2026-10-20T00:00:00.000Z'});
            },
        );

        it('does not reuse the lower-priority source date when the selected source is undated', async () => {
            const {result} = await collect(true, {
                'index.yaml': {updatedAt: '2026-10-21T00:00:00Z'},
                'index.md': {},
            });
            expect(result.pageModifiedTimes).toEqual({});
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
