import type {RawLintConfig} from '@diplodoc/yfmlint';
import type MarkdownIt from 'markdown-it';
import type {IncludeInfo} from '~/core/markdown';

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

describe('Renders prepared for anchor validation', () => {
    function setupRenderer() {
        let renders = 0;
        const run = setupRun({
            langs: ['en'],
            idGenerator: 'constant',
            content: {maxInlineSvgSize: 0},
            allowHtml: true,
            sanitizeHtml: false,
        });
        vi.spyOn(run.markdown, 'titles').mockResolvedValue({});
        const plugin = (md: MarkdownIt) => {
            md.core.ruler.push('count-renders', (state) => {
                state.env.meta = {sequence: ++renders};
            });
            md.renderer.rules.paragraph_open = () => '<p id="custom">';
        };
        vi.spyOn(run.markdown, 'plugins', 'get').mockReturnValue([plugin]);

        return {run, renders: () => renders};
    }

    it('keeps custom renderer IDs and transfers the render environment exactly once', async () => {
        const {run, renders} = setupRenderer();
        const file = normalizePath('en/page.md');
        const options = {deps: [], assets: []};
        const ids = await run.collectAnchors(file, 'Text', options);
        expect(ids).toEqual(new Set(['custom']));
        expect(renders()).toBe(1);

        const [html, env] = await run.transform(file, 'Text', options);
        expect(html).toContain('id="custom"');
        expect(renders()).toBe(1);

        const [, nextEnv] = await run.transform(file, 'Text', options);
        expect(renders()).toBe(2);
        expect(nextEnv).not.toBe(env);
        expect(nextEnv.meta).not.toBe(env.meta);
    });

    it.each(['source', 'options', 'revision'] as const)(
        'renders again when %s changes',
        async (change) => {
            const {run, renders} = setupRenderer();
            const file = normalizePath('en/page.md');
            const options = {deps: [], assets: []};
            await run.collectAnchors(file, 'Text', options);

            if (change === 'options') {
                run.config.allowHtml = false;
            } else if (change === 'revision') {
                run.markdown.release(file);
            }
            await run.transform(file, change === 'source' ? 'Changed' : 'Text', options);

            expect(renders()).toBe(2);
        },
    );

    it('keeps pending environments separate for identical source in different documents', async () => {
        const {run, renders} = setupRenderer();
        const first = normalizePath('en/first.md');
        const second = normalizePath('en/second.md');
        const options = {deps: [], assets: []};
        await run.collectAnchors(first, 'Text', options);

        const [, secondEnv] = await run.transform(second, 'Text', options);
        expect(renders()).toBe(2);
        const [, firstEnv] = await run.transform(first, 'Text', options);

        expect(renders()).toBe(2);
        expect(firstEnv).not.toBe(secondEnv);
        expect(firstEnv.meta).not.toBe(secondEnv.meta);
    });

    it('does not retain a partially rendered environment after a failure', async () => {
        const {run, renders} = setupRenderer();
        const plugins = run.markdown.plugins;
        let attempts = 0;
        const failOnce = (md: MarkdownIt) => {
            md.core.ruler.push('fail-once', () => {
                if (attempts++ === 0) {
                    throw new Error('broken render');
                }
            });
        };
        vi.spyOn(run.markdown, 'plugins', 'get').mockReturnValue([...plugins, failOnce]);
        const file = normalizePath('en/page.md');
        const options = {deps: [], assets: []};

        await expect(run.collectAnchors(file, 'Text', options)).rejects.toThrow('broken render');
        await run.transform(file, 'Text', options);
        expect(renders()).toBe(2);
        await run.transform(file, 'Text', options);
        expect(renders()).toBe(3);
    });

    it('keeps Markdown rendering outside the HTML reuse cache', async () => {
        const {run, renders} = setupRenderer();
        run.config.outputFormat = 'md';
        const file = normalizePath('en/page.md');
        const options = {deps: [], assets: []};

        await run.collectAnchors(file, 'Text', options);
        await run.transform(file, 'Text', options);

        expect(renders()).toBe(2);
    });

    it('does not reuse a render with changed include contents even before a revision is released', async () => {
        const {run, renders} = setupRenderer();
        const file = normalizePath('en/page.md');
        const dep: IncludeInfo = {
            path: normalizePath('en/include.md'),
            link: 'include.md',
            match: '{% include [part](include.md) %}',
            location: [0, 32],
            hash: null,
            search: null,
        };
        const load = vi.spyOn(run.markdown, 'load').mockResolvedValue('Original include');
        const options = {deps: [dep], assets: []};
        await run.collectAnchors(file, 'Text', options);

        load.mockResolvedValue('Changed include');
        await run.transform(file, 'Text', options);

        expect(renders()).toBe(2);
    });
});
