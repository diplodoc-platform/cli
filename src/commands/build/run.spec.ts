import type {RawLintConfig} from '@diplodoc/yfmlint';

import {describe, expect, it, vi} from 'vitest';
import {LogLevels, normalizeConfig} from '@diplodoc/yfmlint';

import {normalizePath} from '~/core/utils';

import {Run} from './run';
import {setupRun} from './__tests__';

describe('Disabled local anchor checks', () => {
    const cases: [string, RawLintConfig, boolean][] = [
        ['false', {YFM025: false}, false],
        ['disabled level', {YFM025: LogLevels.DISABLED}, false],
        ['level object', {YFM025: {level: LogLevels.DISABLED}}, false],
        ['loglevel object', {YFM025: {loglevel: LogLevels.DISABLED}}, false],
        ['alias', {'missing-local-anchor': false}, false],
        ['default', {}, true],
        ['warn', {YFM025: LogLevels.WARN}, true],
        ['error', {YFM025: LogLevels.ERROR}, true],
    ];

    it.each(cases)(
        'builds the anchor index only when enabled by %s',
        async (_, config, enabled) => {
            const run = setupRun({
                langs: ['en'],
                idGenerator: 'constant',
                content: {maxInlineSvgSize: 0},
                lint: {enabled: true, config: normalizeConfig(config)},
            });
            vi.spyOn(run.markdown, 'titles').mockResolvedValue({});
            const index = vi.spyOn(run['anchors'], 'index').mockResolvedValue(new Map());

            await run.lint(
                normalizePath('en/page.md'),
                '# Heading\n\nText.',
                {deps: [], assets: []},
                [],
            );

            expect(index).toHaveBeenCalledTimes(enabled ? 1 : 0);
        },
    );
});

describe('Transform SVG entity limit forwarding', () => {
    it.each([undefined, 0, 1024])('forwards only an explicit limit: %s', (svgMaxEntityCount) => {
        const run = {
            config: {
                langs: ['en'],
                idGenerator: 'constant',
                content: {maxInlineSvgSize: 1024, svgMaxEntityCount},
            },
            markdown: {plugins: []},
            toc: {entrySet: new Set()},
            getEntries: () => [],
            anchors: {resolve: vi.fn()},
        } as unknown as Run;
        const options = Run.prototype['transformConfig'].call(
            run,
            'en/index.md' as NormalizedPath,
            {},
        );

        if (svgMaxEntityCount === undefined) {
            expect(options).not.toHaveProperty('svgMaxEntityCount');
        } else {
            expect(options).toHaveProperty('svgMaxEntityCount', svgMaxEntityCount);
        }
    });
});
