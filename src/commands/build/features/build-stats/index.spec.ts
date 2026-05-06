import type {BuildConfig} from '../..';
import type {Stats} from 'node:fs';
import type {FullTap} from 'tapable';

import {describe, expect, it, vi} from 'vitest';
import {when} from 'vitest-when';

import {getHooks as getBaseHooks} from '~/core/program';

import {setupRun} from '../../__tests__';
import {getHooks as getBuildHooks} from '../../hooks';
import {Build} from '../..';

import {BuildStats, collectFeatures, hashConfig} from './index';

describe('BuildStats', () => {
    describe('collectFeatures', () => {
        it('returns config keys with literal `true`, sorted, ignoring truthy non-`true` values', () => {
            const features = collectFeatures({
                singlePage: true,
                staticContent: true,
                addMapFile: true,
                allowHtml: 1, // truthy but not `true`
                sanitizeHtml: 'yes', // string
                contributors: false,
                lint: {enabled: true}, // nested — top-level only
            });

            expect(features).toEqual(['addMapFile', 'singlePage', 'staticContent']);
        });
    });

    describe('hashConfig', () => {
        it('is stable across key insertion order', () => {
            expect(hashConfig({b: 1, a: 2, c: [1, 2]})).toBe(hashConfig({c: [1, 2], a: 2, b: 1}));
        });

        it('changes when any value changes', () => {
            expect(hashConfig({a: 1})).not.toBe(hashConfig({a: 2}));
        });
    });

    describe('snapshot', () => {
        it('emits a stable JSON shape for a typical build', async () => {
            const build = new Build();
            new BuildStats().apply(build);

            const run = setupRun({
                buildStats: true,
                outputFormat: 'html',
                langs: ['en', 'ru'],
                staticContent: true,
                allowHtml: true,
                sanitizeHtml: true,
                workerMaxOldSpace: 0,
            } as unknown as BuildConfig);

            when(run.glob)
                .calledWith('**/*', expect.anything())
                .thenResolve([
                    'en/index.html',
                    'en/guide.html',
                    'ru/index.html',
                    'assets/style.css',
                ] as NormalizedPath[]);

            const sizes: Record<string, number> = {
                'en/index.html': 1024,
                'en/guide.html': 4096,
                'ru/index.html': 1024,
                'assets/style.css': 512,
            };
            vi.spyOn(run.fs, 'stat').mockImplementation((async (path: string) => {
                const key = Object.keys(sizes).find((k) => path.endsWith(k));
                return {size: key ? sizes[key] : 0} as Stats;
            }) as unknown as typeof run.fs.stat);

            let writtenJson: string | undefined;
            vi.spyOn(run, 'write').mockImplementation(async (path, content) => {
                if (String(path).endsWith('yfm-build-stats.json')) {
                    writtenJson = content;
                }
            });

            const tapByName = (taps: FullTap[], name: string) => {
                const tap = taps.find((t) => t.name === name);
                if (!tap) throw new Error(`tap ${name} not registered`);
                return tap.fn;
            };

            const before = tapByName(getBaseHooks(build).BeforeAnyRun.taps, 'BuildStats');
            const onEntry = tapByName(getBuildHooks(build).Entry.for('html').taps, 'BuildStats');
            const after = tapByName(getBaseHooks(build).AfterAnyRun.taps, 'BuildStats');

            const md = (h: number, html: string) => ({
                leading: false,
                headings: new Array(h).fill({content: 'h', location: {}}),
                html,
            });
            const yaml = {leading: true, data: {}};

            // Populate the graph the way real markdown processing would: pages
            // are `entry`, included files are `source`, image/style assets are
            // `resource`, and a missing file is `missed`. Edges point from page
            // to its deps.
            const rel = run.entry.relations;
            rel.addNode('en/index.md' as NormalizedPath, {type: 'entry'});
            rel.addNode('en/guide.yaml' as NormalizedPath, {type: 'entry'});
            rel.addNode('ru/index.md' as NormalizedPath, {type: 'entry'});
            rel.addNode('en/_includes/intro.md' as NormalizedPath, {type: 'source'});
            rel.addNode('en/_assets/logo.png' as NormalizedPath, {type: 'resource'});
            rel.addNode('en/missing.md' as NormalizedPath, {type: 'missed'});
            rel.addDependency('en/index.md', 'en/_includes/intro.md');
            rel.addDependency('en/index.md', 'en/_assets/logo.png');
            rel.addDependency('en/index.md', 'en/missing.md');

            await before(run);
            await onEntry(run, 'en/index.md' as NormalizedPath, md(3, '<p>hello</p>'));
            await onEntry(run, 'en/guide.yaml' as NormalizedPath, yaml);
            await onEntry(run, 'ru/index.md' as NormalizedPath, md(2, '<p>hi</p>'));
            await after(run);

            expect(writtenJson).toBeDefined();
            expect(sanitize(JSON.parse(writtenJson as string))).toMatchSnapshot();
        });
    });
});

// Volatile fields are replaced with placeholders so the snapshot only asserts
// shape and computed values that don't depend on the host or wall clock.
function sanitize(stats: Hash<unknown>): unknown {
    const PLACEHOLDER = '<NORMALIZED>';
    const cli = stats.cli as Hash<unknown>;
    const _build = stats.build as Hash<unknown>;
    const phases = _build.phasesMs as Record<string, number | null>;

    return {
        ...stats,
        cli: Object.fromEntries(Object.keys(cli).map((k) => [k, PLACEHOLDER])),
        build: {
            ..._build,
            startedAt: PLACEHOLDER,
            finishedAt: PLACEHOLDER,
            durationMs: typeof _build.durationMs === 'number' ? '<NUMBER>' : _build.durationMs,
            phasesMs: Object.fromEntries(
                Object.entries(phases).map(([k, v]) => [k, v === null ? null : '<NUMBER>']),
            ),
            inputDir: PLACEHOLDER,
            outputDir: PLACEHOLDER,
            configHash: PLACEHOLDER,
        },
    };
}
