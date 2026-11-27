import type {MarkdownIt} from '@diplodoc/transform/types';
import type {RawLintConfig} from '@diplodoc/yfmlint';
import type {IncludeInfo} from '~/core/markdown';

import {afterEach, describe, expect, it, vi} from 'vitest';
import transformer from '@diplodoc/transform/parser';
import {LogLevels, normalizeConfig} from '@diplodoc/yfmlint';
import {definePlugin} from '@diplodoc/transform/configuration';
import visibility from '@diplodoc/transform/plugins/visibility';

import {Logger} from '~/core/logger';
import {normalizePath} from '~/core/utils';

import {Run} from './run';
import {configureTransform} from './transform-configuration';
import {setupRun} from './__tests__';
import {getBaseMdItPlugins} from './features/output-html/utils';

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

describe('CLI parser configuration boundary', () => {
    it('keeps hook order and legacy data while isolating configured options and collection', () => {
        const calls: string[] = [];
        const collect = vi.fn((content: string) => content);
        const configured = definePlugin<{path: string; label: string}, {}>({
            id: 'fixture/configured',
            collect,
            setup(md, options, context) {
                calls.push('configured');
                expect(options).toEqual({path: 'plugin-only', label: 'badge'});
                expect(context.path).toBe('en/index.md');
                expect(context).not.toHaveProperty('label');
                md.renderer.rules.text = () => options.label;
            },
        })({path: 'plugin-only', label: 'badge'});
        const run = {
            config: {
                langs: ['en'],
                idGenerator: 'constant',
                content: {maxInlineSvgSize: 1024},
                codeLineWrapping: false,
                supportGithubAnchors: true,
            },
            logger: new Logger(),
            markdown: {plugins: []},
            toc: {entrySet: new Set()},
            getEntries: () => ['en/index.md'],
            anchors: {resolve: vi.fn()},
        } as unknown as Run;
        const base = Run.prototype['transformConfig'].call(
            run,
            'en/index.md' as NormalizedPath,
            {},
        );
        const legacyData = {
            files: {'part.md': 'part'},
            assets: {'image.svg': '<svg/>'},
            titles: {},
        };
        const flat = {
            ...base,
            ...legacyData,
            plugins: [
                (
                    _md: Parameters<typeof configured.plugin>[0],
                    options: typeof base & typeof legacyData,
                ) => {
                    calls.push('legacy');
                    expect(options.files).toBe(legacyData.files);
                    expect(options.assets).toBe(legacyData.assets);
                    expect(options.entries).toEqual(['en/index.md']);
                    expect(options.codeLineWrapping).toBe(false);
                    expect(options.supportGithubAnchors).toBe(true);
                },
                configured.plugin,
            ],
        };
        const migrated = configureTransform(flat);
        expect(migrated).not.toHaveProperty('plugins');
        expect(base).toHaveProperty('plugins');
        expect(base).not.toHaveProperty('pluginConfiguration');
        expect(migrated.pluginConfiguration?.plugins?.[1].plugin.collect).toBe(collect);

        const oldParser = transformer(flat);
        const newParser = transformer(migrated);
        expect(newParser.compile(newParser.parse('text'))).toBe(
            oldParser.compile(oldParser.parse('text')),
        );
        expect(calls).toEqual(['legacy', 'configured', 'legacy', 'configured']);
        expect(collect).not.toHaveBeenCalled();
    });
});

describe('CLI owned document rendering', () => {
    afterEach(() => vi.restoreAllMocks());
    function setupDocumentRun() {
        const run = setupRun({
            langs: ['en'],
            idGenerator: 'constant',
            allowHtml: true,
            sanitizeHtml: true,
            content: {maxInlineSvgSize: 1024},
        });
        const plugins = vi
            .spyOn(run.markdown, 'plugins', 'get')
            .mockReturnValue(getBaseMdItPlugins());
        vi.spyOn(run.markdown, 'titles').mockResolvedValue({});

        return {run, plugins};
    }

    it('reports page occurrences once per build or watch batch and keeps fragment diagnostics', async () => {
        const {run} = setupDocumentRun();
        const file = normalizePath('en/example.md');
        const source = '#|\n|| A {.cell-align-center} ||\n|| B {.cell-align-center} ||\n|#';
        const options = {deps: [], assets: []};
        const page = {...options, pageDiagnostics: true};

        await run.transform(file, source, page);
        await run.transform(file, source, page);
        const messages = vi.mocked(run.logger.deprecation).mock.calls;
        expect(messages).toHaveLength(2);
        expect(messages[0][0]).toContain('en/example.md:2:3');
        expect(messages[1][0]).toContain('en/example.md:3:3');

        await run.transform(file, source, options);
        await run.transform(file, source, options);
        expect(messages).toHaveLength(6);

        run.resetPageDeprecations();
        await run.transform(file, source, page);
        expect(messages).toHaveLength(8);
    });

    it('preserves ordinary logger topics and unlocated plugin deprecations', () => {
        const {run} = setupDocumentRun();
        const {log} = run['transformConfig'](normalizePath('a.md'), {}, true);
        expect(log.warn).toBe(run.logger.warn);
        expect(log.error).toBe(run.logger.error);
        expect(log.info).toBe(run.logger.info);
        expect(log.proc).toBe(run.logger.proc);
        expect(log.deprecation.count).toBe(run.logger.deprecation.count);
        log.warn('[DEPRECATED CUSTOM]', 'from plugin');
        expect(run.logger.warn).toHaveBeenCalledWith('[DEPRECATED CUSTOM]', 'from plugin');

        log.deprecation('plugin warning');
        log.deprecation('plugin warning');
        log.deprecation('legacy', 'component');
        expect(run.logger.deprecation).toHaveBeenCalledTimes(3);
        expect(run.logger.deprecation).toHaveBeenCalledWith('legacy', 'component');

        run.logger.setup({deprecationWarnings: false});
        log.deprecation(
            '[DEPRECATED CODE] Feature at a.md:2:3. Use replacement. Removal: version 6.',
        );
        expect(run.logger.deprecation).toHaveBeenCalledTimes(3);
    });

    it('returns separate actual document resources for consecutive roots and materialized includes', async () => {
        const {run} = setupDocumentRun();
        const [first, firstEnv] = await run.transform(
            normalizePath('en/a.md'),
            `# Root A

{% include [part](part.md) %}

{% included (part.md) %}
{% file src="asset.txt" name="Included file" %}
{% endincluded %}
`,
            {deps: [], assets: []},
        );
        const [second, secondEnv] = await run.transform(
            normalizePath('en/b.md'),
            '# Root B\n\nClean body.',
            {deps: [], assets: []},
        );

        expect(first).toContain('Included file');
        expect(firstEnv.meta?.style).toContain('_assets/file-extension.css');
        expect(second).toContain('Clean body.');
        expect(secondEnv.title).toBe('Root B');
        expect(second).not.toContain('Included file');
        expect(secondEnv).not.toBe(firstEnv);
        expect(secondEnv.meta?.style || []).not.toContain('_assets/file-extension.css');
        expect(firstEnv.meta?.style).toContain('_assets/file-extension.css');
    });

    it('recovers with a fresh configured parser after rendering fails', async () => {
        const {run, plugins} = setupDocumentRun();
        const base = getBaseMdItPlugins();
        plugins.mockReturnValue([
            ...base,
            (md) => {
                md.renderer.rules.paragraph_open = () => {
                    throw new Error('fixture render failure');
                };
            },
        ]);
        await expect(
            run.transform(normalizePath('en/failed.md'), 'Failed body.', {deps: [], assets: []}),
        ).rejects.toThrow('fixture render failure');
        plugins.mockReturnValue(base);
        const [html, env] = await run.transform(normalizePath('en/good.md'), 'Recovered body.', {
            deps: [],
            assets: [],
        });

        expect(html).toContain('Recovered body.');
        expect(html).not.toContain('Failed body.');
        expect(env.meta?.style || []).toEqual([]);
    });

    it('keeps CLI-configured handles associated through interleaved and derived-token compilation', () => {
        const {run} = setupDocumentRun();
        const options = configureTransform(
            run['transformConfig'](normalizePath('en/index.md'), {}),
        );
        const parser = transformer(options);
        const first = parser.parseDocument('# First\n\nFirst body.');
        const second = parser.parseDocument('# Second\n\nSecond body.');
        const html = parser.compileDocument(first);

        expect(html).toContain('First body.');
        expect(html).not.toContain('Second body.');
        expect(parser.compile(first.tokens.slice(), first)).toBe(html);
        expect(parser.compileDocument(second)).toContain('Second body.');
        expect(transformer(options).compileDocument.bind(null, first)).toThrow();
    });
});

describe('Renders prepared for anchor validation', () => {
    function setupRenderer() {
        let renders = 0;
        const run = setupRun({
            langs: ['en'],
            idGenerator: 'constant',
            content: {maxInlineSvgSize: 0},
            template: {enabled: false, features: {substitutions: false}, scopes: {code: false}},
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

    it('reports embedded-source errors for output and lint but suppresses anchor probes', async () => {
        const {run} = setupRenderer();
        run.config.lint = {enabled: true, config: {}};
        vi.spyOn(run['anchors'], 'index').mockResolvedValue(new Map());
        const file = normalizePath('en/page.md');
        const source = '# Page\n\n{% included (broken.md) %}\nUnclosed source';
        const options = {deps: [], assets: []};

        await run.collectAnchors(file, source, options);
        expect(run.logger.error).not.toHaveBeenCalled();
        await run.transform(file, source, {...options, reportErrors: false});
        expect(run.logger.error).not.toHaveBeenCalled();

        await run.transform(file, source, options);
        expect(run.logger.error).toHaveBeenCalledTimes(1);
        vi.mocked(run.logger.error).mockClear();
        await run.lint(file, source, {...options, reportErrors: false}, []);
        expect(run.logger.error).toHaveBeenCalledTimes(1);
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

describe('page audience link diagnostics', () => {
    it.each([
        {sourceAudience: 'common', reportErrors: true, errors: 1},
        {sourceAudience: 'agent', reportErrors: true, errors: 0},
        {sourceAudience: 'common', reportErrors: false, errors: 0},
        {sourceAudience: 'agent', reportErrors: false, errors: 0},
    ])(
        'checks only human output, source=$sourceAudience, reportErrors=$reportErrors',
        async ({sourceAudience, reportErrors, errors}) => {
            const run = setupRun({
                langs: ['ru'],
                idGenerator: 'constant',
                content: {maxInlineSvgSize: 0},
                template: {enabled: false, features: {substitutions: false}, scopes: {code: false}},
            });
            vi.spyOn(run.markdown, 'titles').mockResolvedValue({});
            vi.spyOn(run.toc, 'audience').mockImplementation((path) => {
                if (path === 'ru/index.md') {
                    return sourceAudience as 'agent' | 'common';
                }
                return path === 'ru/agent.md' ? 'agent' : undefined;
            });
            const error = run.logger.error;
            const file = normalizePath('ru/index.md');
            const source = '[Agent](/ru/agent.md)';
            const options = {assets: [], deps: [], reportErrors};
            await run.collectAnchors(file, source, options);
            expect(error).not.toHaveBeenCalled();
            expect(run['anchorRenders'].size).toBe(1);
            await run.transform(file, source, options);
            expect(run['anchorRenders'].size).toBe(0);

            expect(error).toHaveBeenCalledTimes(errors);
            if (errors) {
                expect(error).toHaveBeenCalledWith(
                    expect.stringContaining(
                        'Human page ru/index.md links to agent-only page ru/agent.md',
                    ),
                );
            }
        },
    );
});

describe('Markdown audience lint', () => {
    it('preserves linked titles and anchor data for Markdown lint plugins by default', async () => {
        const run = setupRun({
            outputFormat: 'md',
            langs: ['en'],
            idGenerator: 'constant',
            content: {maxInlineSvgSize: 0},
            lint: {enabled: true, config: {}},
        });
        const file = normalizePath('en/page.md');
        const target = normalizePath('en/target.md');
        vi.spyOn(run.markdown, 'titles').mockResolvedValue({'#details': 'Details'});
        const anchorIndex = new Map([[target, new Set(['details'])]]);
        vi.spyOn(run['anchors'], 'index').mockResolvedValue(anchorIndex);
        const plugin = vi.fn((_md: MarkdownIt, options: Record<string, unknown>) => {
            expect(options.titles).toMatchObject({[target]: {'#details': 'Details'}});
            expect(options.anchorIndex).toBe(anchorIndex);
        });

        await run.lint(
            file,
            '# Heading\n\n[{#T}](target.md#details)',
            {
                deps: [],
                assets: [
                    {
                        path: target,
                        hash: '#details',
                        search: null,
                        type: 'link',
                        title: '{#T}',
                        autotitle: true,
                        location: [3, 0],
                    },
                ],
            },
            [plugin],
        );

        expect(plugin).toHaveBeenCalled();
    });

    it.each([
        ['md', true],
        ['html', true],
        ['md', false],
    ] as const)('keeps %s lint diagnostics with prepareLinks=%s', async (format, prepareLinks) => {
        const run = setupRun({
            outputFormat: format,
            langs: ['en'],
            idGenerator: 'constant',
            content: {maxInlineSvgSize: 0},
            lint: {enabled: true, config: {}},
        });
        const titles = vi.spyOn(run.markdown, 'titles').mockImplementation(async () => {
            if (!prepareLinks) {
                throw new Error('Unneeded title lookup');
            }
            return {};
        });
        const index = vi.spyOn(run['anchors'], 'index').mockImplementation(async () => {
            if (!prepareLinks) {
                throw new Error('Unneeded anchor lookup');
            }
            return new Map();
        });
        const code = '`' + 'x'.repeat(120) + '`';
        const errors = await run.lint(
            normalizePath('en/page.md'),
            '# Heading\n\n' + code + '\n\n:::visibility robots\nText.\n:::',
            {deps: [], assets: [], prepareLinks},
            [visibility],
        );
        expect(index).toHaveBeenCalledTimes(prepareLinks ? 1 : 0);
        expect(titles).toHaveBeenCalledTimes(prepareLinks ? 1 : 0);
        expect(errors?.some((error) => error.ruleNames.includes('YFM023'))).toBe(true);
        expect(errors?.some((error) => error.ruleNames.includes('YFM001'))).toBe(true);
    });
});

describe('Compact linked title cache', () => {
    it('shares concurrent title loading and returns independent dictionaries', async () => {
        const run = setupRun({});
        const titles = vi
            .spyOn(run.markdown, 'titles')
            .mockResolvedValue({'#': 'Title', '#custom': 'Пример 🧩 \ud800'});
        const file = normalizePath('page.md');
        const [first, second] = await Promise.all([run['titles'](file), run['titles'](file)]);
        expect(titles).toHaveBeenCalledTimes(1);
        expect(first).toEqual(second);
        first['#'] = 'Changed by consumer';
        expect((await run['titles'](file))['#']).toBe('Title');
        expect(second['#custom']).toBe('Пример 🧩 \ud800');
    });

    it('invalidates the dictionary after Markdown changes', async () => {
        const run = setupRun({});
        const titles = vi
            .spyOn(run.markdown, 'titles')
            .mockResolvedValueOnce({'#': 'Before'})
            .mockResolvedValueOnce({'#': 'After'});
        const file = normalizePath('page.md');
        expect(await run['titles'](file)).toEqual({'#': 'Before'});
        run.markdown.release(file);
        expect(await run['titles'](file)).toEqual({'#': 'After'});
        expect(titles).toHaveBeenCalledTimes(2);
    });

    it('retries a failed dictionary lookup', async () => {
        const run = setupRun({});
        vi.spyOn(run.markdown, 'titles')
            .mockRejectedValueOnce(new Error('read failed'))
            .mockResolvedValueOnce({'#': 'Recovered'});
        const file = normalizePath('page.md');
        await expect(run['titles'](file)).rejects.toThrow('read failed');
        await expect(run['titles'](file)).resolves.toEqual({'#': 'Recovered'});
    });
});
