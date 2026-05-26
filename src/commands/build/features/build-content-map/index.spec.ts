import type {BuildConfig} from '../..';
import type {Stats} from 'node:fs';
import type {FullTap} from 'tapable';

import {describe, expect, it, vi} from 'vitest';
import {when} from 'vitest-when';

import {getHooks as getBaseHooks} from '~/core/program';

import {setupRun} from '../../__tests__';
import {Build} from '../..';

import {
    BuildContentMap,
    collectPageAssets,
    hashContent,
    isExcludedServiceFile,
    mapOutputToSource,
} from './index';

describe('BuildContentMap', () => {
    describe('config wiring', () => {
        it('exposes --build-content option and normalizes config flag', async () => {
            const build = new Build();
            new BuildContentMap().apply(build);

            const tapByName = (taps: FullTap[], name: string) => {
                const tap = taps.find((t) => t.name === name);
                if (!tap) throw new Error(`tap ${name} not registered`);
                return tap.fn;
            };

            const commandTap = tapByName(getBaseHooks(build).Command.taps, 'BuildContentMap');
            const configTap = tapByName(getBaseHooks(build).Config.taps, 'BuildContentMap');

            // Command tap should add an option without throwing.
            const seenOptions: unknown[] = [];
            const fakeCommand = {addOption: (o: unknown) => seenOptions.push(o)};
            commandTap(fakeCommand);
            expect(seenOptions).toHaveLength(1);

            // Config tap should set buildContent=true when arg=true.
            const config = {} as BuildConfig;
            const result = await configTap(config, {buildContent: true});
            expect(result.buildContent).toBe(true);

            // And false when nothing is set.
            const config2 = {} as BuildConfig;
            const result2 = await configTap(config2, {});
            expect(result2.buildContent).toBe(false);
        });
    });

    describe('collectPageAssets', () => {
        it('returns prime-resource deps per entry, ignoring source/missed nodes', () => {
            const run = setupRun({} as unknown as BuildConfig);
            const rel = run.entry.relations;

            rel.addNode('ru/index.md' as NormalizedPath, {type: 'entry'});
            rel.addNode('ru/_includes/intro.md' as NormalizedPath, {type: 'source'});
            rel.addNode('ru/img/pic.png' as NormalizedPath, {type: 'resource'});
            rel.addNode('ru/img/icon.svg' as NormalizedPath, {type: 'resource'});
            rel.addNode('ru/missing.md' as NormalizedPath, {type: 'missed'});

            rel.addDependency('ru/index.md', 'ru/_includes/intro.md');
            rel.addDependency('ru/index.md', 'ru/img/pic.png');
            rel.addDependency('ru/index.md', 'ru/img/icon.svg');
            rel.addDependency('ru/index.md', 'ru/missing.md');

            expect(collectPageAssets(run)).toEqual({
                'ru/index.md': ['ru/img/icon.svg', 'ru/img/pic.png'],
            });
        });

        it('returns empty object when there are no entries', () => {
            const run = setupRun({} as unknown as BuildConfig);
            expect(collectPageAssets(run)).toEqual({});
        });

        it('omits entries that have no resource deps', () => {
            const run = setupRun({} as unknown as BuildConfig);
            const rel = run.entry.relations;
            rel.addNode('ru/lone.md' as NormalizedPath, {type: 'entry'});
            expect(collectPageAssets(run)).toEqual({});
        });
    });

    describe('mapOutputToSource', () => {
        function makeRun() {
            const run = setupRun({} as unknown as BuildConfig);
            const rel = run.entry.relations;
            rel.addNode('ru/foo.md' as NormalizedPath, {type: 'entry'});
            rel.addNode('ru/_includes/inc.md' as NormalizedPath, {type: 'source'});
            rel.addNode('ru/img/pic.png' as NormalizedPath, {type: 'resource'});
            return run;
        }

        it('returns identity for an entry file present in the graph', () => {
            const run = makeRun();
            expect(mapOutputToSource('ru/foo.md' as NormalizedPath, run)).toBe('ru/foo.md');
        });

        it('returns identity for a resource file present in the graph', () => {
            const run = makeRun();
            expect(mapOutputToSource('ru/img/pic.png' as NormalizedPath, run)).toBe(
                'ru/img/pic.png',
            );
        });

        it('reverses signlink for an include file (name-{12hex}.md → name.md)', () => {
            const run = makeRun();
            expect(
                mapOutputToSource('ru/_includes/inc-abcdef012345.md' as NormalizedPath, run),
            ).toBe('ru/_includes/inc.md');
        });

        it('returns identity when signlink reverse does not resolve to a known source', () => {
            const run = makeRun();
            // No source matches `unrelated.md` — fall through to identity.
            expect(
                mapOutputToSource('ru/_includes/unrelated-abcdef012345.md' as NormalizedPath, run),
            ).toBe('ru/_includes/unrelated-abcdef012345.md');
        });

        it('returns identity for an output file unknown to the graph', () => {
            const run = makeRun();
            expect(mapOutputToSource('ru/orphan.md' as NormalizedPath, run)).toBe('ru/orphan.md');
        });
    });

    describe('isExcludedServiceFile', () => {
        it('excludes yfm-build-*.json', () => {
            expect(isExcludedServiceFile('yfm-build-manifest.json' as NormalizedPath)).toBe(true);
            expect(isExcludedServiceFile('yfm-build-stats.json' as NormalizedPath)).toBe(true);
            expect(isExcludedServiceFile('yfm-build-content.json' as NormalizedPath)).toBe(true);
        });

        it('excludes yfm-*-meta.json', () => {
            expect(isExcludedServiceFile('yfm-redirects-meta-file.json' as NormalizedPath)).toBe(
                true,
            );
        });

        it('keeps regular content files', () => {
            expect(isExcludedServiceFile('ru/foo.md' as NormalizedPath)).toBe(false);
            expect(isExcludedServiceFile('ru/img/pic.png' as NormalizedPath)).toBe(false);
            expect(isExcludedServiceFile('ru/_includes/inc-abc123.md' as NormalizedPath)).toBe(
                false,
            );
        });

        it('keeps yfm-build-named files nested in subdirectories (filter is top-level only)', () => {
            expect(isExcludedServiceFile('ru/yfm-build-manifest.json' as NormalizedPath)).toBe(
                false,
            );
        });
    });

    describe('hashContent', () => {
        it('returns `sha256-{hex}` for a buffer', () => {
            const hash = hashContent(Buffer.from('hello'));
            // sha256('hello') = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
            expect(hash).toBe(
                'sha256-2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
            );
        });

        it('is deterministic', () => {
            const a = hashContent(Buffer.from([0x01, 0x02, 0x03]));
            const b = hashContent(Buffer.from([0x01, 0x02, 0x03]));
            expect(a).toBe(b);
        });

        it('differs for differing inputs', () => {
            const a = hashContent(Buffer.from('a'));
            const b = hashContent(Buffer.from('b'));
            expect(a).not.toBe(b);
        });
    });

    describe('snapshot', () => {
        it('emits a stable JSON shape for a typical md build', async () => {
            const build = new Build();
            new BuildContentMap().apply(build);

            const run = setupRun({
                buildContent: true,
                outputFormat: 'md',
            } as unknown as BuildConfig);

            when(run.glob)
                .calledWith('**/*', expect.anything())
                .thenResolve([
                    'ru/foo.md',
                    'ru/_includes/inc-abcdef012345.md',
                    'ru/img/pic.png',
                    'yfm-build-manifest.json',
                    'yfm-build-content.json',
                ] as NormalizedPath[]);

            const files: Record<string, Buffer> = {
                'ru/foo.md': Buffer.from('# Foo\n[](_includes/inc-abcdef012345.md)\n'),
                'ru/_includes/inc-abcdef012345.md': Buffer.from('Inc content\n'),
                'ru/img/pic.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
                'yfm-build-manifest.json': Buffer.from('{}'),
                'yfm-build-content.json': Buffer.from('{}'),
            };
            vi.spyOn(run.fs, 'readFile').mockImplementation((async (path: string) => {
                const normalized = String(path).replace(/\\/g, '/');
                const key = Object.keys(files).find((k) => normalized.endsWith(k));
                if (!key) {
                    throw new Error(`unexpected readFile: ${normalized}`);
                }
                return files[key];
            }) as unknown as typeof run.fs.readFile);
            vi.spyOn(run.fs, 'stat').mockImplementation((async (path: string) => {
                const normalized = String(path).replace(/\\/g, '/');
                const key = Object.keys(files).find((k) => normalized.endsWith(k));
                return {size: key ? files[key].length : 0} as Stats;
            }) as unknown as typeof run.fs.stat);

            let writtenJson: string | undefined;
            vi.spyOn(run, 'write').mockImplementation(async (path, content) => {
                if (String(path).endsWith('yfm-build-content.json')) {
                    writtenJson = content;
                }
            });

            // Graph: foo.md is an entry that includes inc.md and references pic.png.
            const rel = run.entry.relations;
            rel.addNode('ru/foo.md' as NormalizedPath, {type: 'entry'});
            rel.addNode('ru/_includes/inc.md' as NormalizedPath, {type: 'source'});
            rel.addNode('ru/img/pic.png' as NormalizedPath, {type: 'resource'});
            rel.addDependency('ru/foo.md', 'ru/_includes/inc.md');
            rel.addDependency('ru/foo.md', 'ru/img/pic.png');

            const tapByName = (taps: FullTap[], name: string) => {
                const tap = taps.find((t) => t.name === name);
                if (!tap) throw new Error(`tap ${name} not registered`);
                return tap.fn;
            };
            const after = tapByName(getBaseHooks(build).AfterAnyRun.taps, 'BuildContentMap');

            await after(run);

            expect(writtenJson).toBeDefined();
            expect(JSON.parse(writtenJson as string)).toMatchSnapshot();
        });

        it('writes nothing when flag is off', async () => {
            const build = new Build();
            new BuildContentMap().apply(build);

            const run = setupRun({
                buildContent: false,
                outputFormat: 'md',
            } as unknown as BuildConfig);

            const writeSpy = vi.spyOn(run, 'write').mockResolvedValue();

            const tapByName = (taps: FullTap[], name: string) => {
                const tap = taps.find((t) => t.name === name);
                if (!tap) throw new Error(`tap ${name} not registered`);
                return tap.fn;
            };
            const after = tapByName(getBaseHooks(build).AfterAnyRun.taps, 'BuildContentMap');

            await after(run);

            expect(writeSpy).not.toHaveBeenCalled();
        });
    });
});
