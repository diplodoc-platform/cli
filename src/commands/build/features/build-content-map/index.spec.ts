import type {BuildConfig} from '../..';
import type {FullTap} from 'tapable';

import {describe, expect, it} from 'vitest';

import {getHooks as getBaseHooks} from '~/core/program';

import {setupRun} from '../../__tests__';
import {Build} from '../..';

import {BuildContentMap, collectPageAssets, mapOutputToSource} from './index';

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
});
