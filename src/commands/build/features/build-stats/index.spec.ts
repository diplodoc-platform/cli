import type {BuildConfig} from '../..';
import type {Stats} from 'node:fs';
import type {FullTap} from 'tapable';

import {describe, expect, it, vi} from 'vitest';
import {when} from 'vitest-when';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getLoggerHooks} from '~/core/logger';

import {setupRun} from '../../__tests__';
import {getHooks as getBuildHooks} from '../../hooks';
import {Build} from '../..';

import {BuildStats, collectFeatures} from './index';

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
                // Normalize backslashes — on Windows `join` produces `\` paths
                // but the fixture keys use forward slashes.
                const normalized = path.replace(/\\/g, '/');
                const key = Object.keys(sizes).find((k) => normalized.endsWith(k));
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

            // Drive the logger hooks directly: setupRun mocks `logger.warn` /
            // `logger.error` topics, which short-circuits the internal hook
            // dispatch. We trigger the hooks so the by-code bucketing logic is
            // actually exercised.
            const loggerHooks = getLoggerHooks(run.logger);
            loggerHooks.Warn.call('en/page.md: YFM013 / File asset limit exceeded');
            loggerHooks.Warn.call('Some plain warning without a code');
            loggerHooks.Error.call('en/cycle.md: YFM016 / The file is included in itself');
            loggerHooks.Error.call('en/cycle2.md: YFM016 / Another cycle');

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
            memoryUsageMb:
                typeof _build.memoryUsageMb === 'number' ? '<NUMBER>' : _build.memoryUsageMb,
        },
    };
}
