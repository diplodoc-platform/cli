import type {BuildArgs, OpenapiCompanionEntry, Run} from '~/commands/build';
import type {LlmsConfig} from './index';

import {beforeEach, describe, expect, it, vi} from 'vitest';

import {OutputFormat} from '~/commands/build/config';

import {LLMS_FULL_FILENAME, Llms} from './index';

vi.mock('~/core/utils', () => ({
    normalizePath: (path: string) => path as NormalizedPath,
    setExt: (path: string, ext: string) => {
        const stripped = path.replace(/\.[^/.]+$/, '');
        return ext ? `${stripped}.${ext}` : stripped;
    },
}));

vi.mock('~/core/program', () => ({
    getHooks: () => ({
        Command: {tap: vi.fn()},
        Config: {tap: vi.fn()},
        AfterAnyRun: {tapPromise: vi.fn()},
    }),
}));

vi.mock('~/core/config', () => ({
    defined: (option: string, ...scopes: Record<string, unknown>[]) => {
        for (const scope of scopes) {
            if (option in scope) {
                return scope[option];
            }
        }
        return null;
    },
    option: vi.fn(),
}));

vi.mock('~/commands/config', () => ({
    options: {},
}));

vi.mock('../output-md/collect', () => {
    return {
        SELF_CONTAINED: 'self-contained',
        MarkdownCollector: vi.fn().mockImplementation(() => ({
            collect: vi.fn().mockResolvedValue('Collected Markdown Content'),
        })),
    };
});

const normalizedPath = (path: string) => path as NormalizedPath;

function createMockRun(
    options: {
        outputFormat?: OutputFormat;
        enabled?: boolean;
        description?: string;
        llmsFullMaxSize?: number;
        openapiCompanions?: OpenapiCompanionEntry[];
    } = {},
): Run {
    return {
        config: {
            outputFormat: options.outputFormat ?? OutputFormat.html,
            llms: {
                enabled: options.enabled ?? true,
                description: options.description ?? 'AI Assistant Context Description',
                llmsFullMaxSize: options.llmsFullMaxSize ?? 4 * 1024 ** 2,
            },
        } as unknown as LlmsConfig & {outputFormat: OutputFormat},
        meta: {
            dump: vi.fn().mockResolvedValue({
                title: 'Meta Title Target',
                description: 'Detailed meta description text',
            }),
        },
        logger: {
            warn: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
        },
        openapiCompanions: options.openapiCompanions,
    } as unknown as Run;
}

const makeLlmsArgs = (llms: boolean | null) => ({llms}) as unknown as BuildArgs;

/**
 * Exposes private methods of Llms for testing.
 * Avoids `any` while allowing access to private members.
 */
type TestableLlms = {
    resolveLlmsEnabled(
        args: BuildArgs,
        config: Partial<LlmsConfig['llms']> | undefined,
        onlyMd: boolean,
    ): boolean;
    renderIndex(run: Run, title: string, entries: unknown[], tocDir: string): Promise<string>;
    renderFull(run: Run, title: string, entries: unknown[]): Promise<string>;
};

describe('LLMs Plugin Architecture', () => {
    let llmsInstance: TestableLlms;

    beforeEach(() => {
        llmsInstance = new Llms() as unknown as TestableLlms;
    });

    describe('resolveLlmsEnabled logic', () => {
        describe('when --llms flag is explicitly passed', () => {
            it('enables generation for md, regardless of config', () => {
                expect(llmsInstance.resolveLlmsEnabled(makeLlmsArgs(true), undefined, true)).toBe(
                    true,
                );
                expect(
                    llmsInstance.resolveLlmsEnabled(makeLlmsArgs(true), {enabled: false}, true),
                ).toBe(true);
                expect(
                    llmsInstance.resolveLlmsEnabled(makeLlmsArgs(true), {enabled: true}, true),
                ).toBe(true);
            });

            it('enables generation for html, regardless of config', () => {
                expect(llmsInstance.resolveLlmsEnabled(makeLlmsArgs(true), undefined, false)).toBe(
                    true,
                );
                expect(
                    llmsInstance.resolveLlmsEnabled(makeLlmsArgs(true), {enabled: false}, false),
                ).toBe(true);
                expect(
                    llmsInstance.resolveLlmsEnabled(makeLlmsArgs(true), {enabled: true}, false),
                ).toBe(true);
            });
        });

        describe('when --no-llms flag is explicitly passed', () => {
            it('disables generation for md, regardless of config', () => {
                expect(llmsInstance.resolveLlmsEnabled(makeLlmsArgs(false), undefined, true)).toBe(
                    false,
                );
                expect(
                    llmsInstance.resolveLlmsEnabled(makeLlmsArgs(false), {enabled: true}, true),
                ).toBe(false);
                expect(
                    llmsInstance.resolveLlmsEnabled(makeLlmsArgs(false), {enabled: false}, true),
                ).toBe(false);
            });

            it('disables generation for html, regardless of config', () => {
                expect(llmsInstance.resolveLlmsEnabled(makeLlmsArgs(false), undefined, false)).toBe(
                    false,
                );
                expect(
                    llmsInstance.resolveLlmsEnabled(makeLlmsArgs(false), {enabled: true}, false),
                ).toBe(false);
                expect(
                    llmsInstance.resolveLlmsEnabled(makeLlmsArgs(false), {enabled: false}, false),
                ).toBe(false);
            });
        });

        describe('when flag is not passed at all', () => {
            it('disables generation when config explicitly sets enabled: false (md)', () => {
                expect(
                    llmsInstance.resolveLlmsEnabled(makeLlmsArgs(null), {enabled: false}, true),
                ).toBe(false);
            });

            it('disables generation when config explicitly sets enabled: false (html)', () => {
                expect(
                    llmsInstance.resolveLlmsEnabled(makeLlmsArgs(null), {enabled: false}, false),
                ).toBe(false);
            });

            it('enables generation for md when config explicitly sets enabled: true', () => {
                expect(
                    llmsInstance.resolveLlmsEnabled(makeLlmsArgs(null), {enabled: true}, true),
                ).toBe(true);
            });

            it('enables generation for html when config explicitly sets enabled: true', () => {
                expect(
                    llmsInstance.resolveLlmsEnabled(makeLlmsArgs(null), {enabled: true}, false),
                ).toBe(true);
            });

            it('enables generation for md when there is no llms config section at all', () => {
                expect(llmsInstance.resolveLlmsEnabled(makeLlmsArgs(null), undefined, true)).toBe(
                    true,
                );
            });

            it('disables generation for html when there is no llms config section at all', () => {
                expect(llmsInstance.resolveLlmsEnabled(makeLlmsArgs(null), undefined, false)).toBe(
                    false,
                );
            });

            it('enables generation for md when config object exists but has no enabled key', () => {
                expect(llmsInstance.resolveLlmsEnabled(makeLlmsArgs(null), {}, true)).toBe(true);
            });

            it('disables generation for html when config object exists but has no enabled key', () => {
                expect(llmsInstance.resolveLlmsEnabled(makeLlmsArgs(null), {}, false)).toBe(false);
            });
        });
    });

    describe('Config hook preserves url', () => {
        const applyConfig = (config: Record<string, unknown>) => {
            new Llms().apply({
                Command: {tap: vi.fn()},
                Config: {tap: (fn: Function) => fn(config, {llms: null})},
                AfterAnyRun: {tapPromise: vi.fn()},
            } as any);
        };

        it('preserves url from raw config', () => {
            const config = {
                outputFormat: OutputFormat.md,
                llms: {
                    enabled: true,
                    url: 'https://example.com/llms.txt',
                    llmsFullMaxSize: 4 * 1024 ** 2,
                },
            } as unknown as LlmsConfig & {outputFormat: OutputFormat};

            applyConfig(config as unknown as Record<string, unknown>);

            expect(config.llms.url).toBe('https://example.com/llms.txt');
        });

        it('preserves url even when enabled is false', () => {
            const config = {
                outputFormat: OutputFormat.md,
                llms: {
                    enabled: false,
                    url: 'https://example.com/llms.txt',
                    llmsFullMaxSize: 4 * 1024 ** 2,
                },
            } as unknown as LlmsConfig & {outputFormat: OutputFormat};

            applyConfig(config as unknown as Record<string, unknown>);

            expect(config.llms.url).toBe('https://example.com/llms.txt');
            expect(config.llms.enabled).toBe(false);
        });

        it('leaves url undefined when not set in config', () => {
            const config = {
                outputFormat: OutputFormat.md,
                llms: {
                    enabled: true,
                    llmsFullMaxSize: 4 * 1024 ** 2,
                },
            } as unknown as LlmsConfig & {outputFormat: OutputFormat};

            applyConfig(config as unknown as Record<string, unknown>);

            expect(config.llms.url).toBeUndefined();
        });
    });

    describe('renderIndex logic', () => {
        it('should correctly format llms.txt index with title and description', async () => {
            const run = createMockRun({outputFormat: OutputFormat.html});
            const entries = [
                {
                    href: normalizedPath('intro.md'),
                    path: normalizedPath('docs/intro.md'),
                    name: 'Introduction Page',
                },
            ];

            const result = await llmsInstance.renderIndex(run, 'My Product Docs', entries, 'docs');

            expect(result).toContain('# My Product Docs\n');
            expect(result).toContain('> AI Assistant Context Description\n');
            expect(result).toContain('## Documentation\n');
            expect(result).toContain(
                '- [Introduction Page](intro.html): Detailed meta description text',
            );
            expect(result).toContain(
                `For more comprehensive documentation, see [${LLMS_FULL_FILENAME}](/${LLMS_FULL_FILENAME})`,
            );
        });

        it('should use markdown extensions for md output formats', async () => {
            const run = createMockRun({outputFormat: OutputFormat.md});
            const entries = [
                {
                    href: normalizedPath('setup.md'),
                    path: normalizedPath('docs/setup.md'),
                    name: 'Setup Guide',
                },
            ];

            const result = await llmsInstance.renderIndex(run, 'MD Project', entries, 'docs');

            expect(result).toContain('- [Setup Guide](setup.md): Detailed meta description text');
        });

        it('should fallback to meta title if entry name is missing', async () => {
            const run = createMockRun();
            const entries = [
                {
                    href: normalizedPath('root.md'),
                    path: normalizedPath('docs/root.md'),
                    name: '',
                },
            ];

            const result = await llmsInstance.renderIndex(run, 'Fallback Title', entries, 'docs');

            expect(result).toContain('- [Meta Title Target](root.html)');
        });
    });

    describe('renderIndex OpenAPI companion links', () => {
        it('should add companion link when leading page matches an entry', async () => {
            const run = createMockRun({
                openapiCompanions: [
                    {
                        leadingPage: 'docs/api/index',
                        companionPath: 'docs/api/petstore.openapi.json',
                    },
                ],
            });
            const entries = [
                {
                    href: normalizedPath('api/index.md'),
                    path: normalizedPath('docs/api/index.md'),
                    name: 'The complete API Reference',
                },
            ];

            const result = await llmsInstance.renderIndex(run, 'Docs', entries, 'docs');

            expect(result).toContain(
                '- [The complete API Reference](api/petstore.openapi.json): OpenAPI specification',
            );
        });

        it('should not add companion link when no matching entry (different toc)', async () => {
            const run = createMockRun({
                openapiCompanions: [
                    {leadingPage: 'ru/api/index', companionPath: 'ru/api/petstore.openapi.json'},
                ],
            });
            const entries = [
                {
                    href: normalizedPath('intro.md'),
                    path: normalizedPath('docs/intro.md'),
                    name: 'Introduction',
                },
            ];

            const result = await llmsInstance.renderIndex(run, 'Docs', entries, 'docs');

            expect(result).not.toContain('OpenAPI specification');
        });

        it('should not add companion link when openapiCompanions is empty', async () => {
            const run = createMockRun({openapiCompanions: []});
            const entries = [
                {
                    href: normalizedPath('api/index.md'),
                    path: normalizedPath('docs/api/index.md'),
                    name: 'API Reference',
                },
            ];

            const result = await llmsInstance.renderIndex(run, 'Docs', entries, 'docs');

            expect(result).not.toContain('OpenAPI specification');
        });

        it('should not add companion link when openapiCompanions is undefined', async () => {
            const run = createMockRun();
            const entries = [
                {
                    href: normalizedPath('api/index.md'),
                    path: normalizedPath('docs/api/index.md'),
                    name: 'API Reference',
                },
            ];

            const result = await llmsInstance.renderIndex(run, 'Docs', entries, 'docs');

            expect(result).not.toContain('OpenAPI specification');
        });

        it('should deduplicate companions with the same companionPath', async () => {
            const run = createMockRun({
                openapiCompanions: [
                    {
                        leadingPage: 'docs/api/index',
                        companionPath: 'docs/api/petstore.openapi.json',
                    },
                    {
                        leadingPage: 'docs/api/index',
                        companionPath: 'docs/api/petstore.openapi.json',
                    },
                ],
            });
            const entries = [
                {
                    href: normalizedPath('api/index.md'),
                    path: normalizedPath('docs/api/index.md'),
                    name: 'API Reference',
                },
            ];

            const result = await llmsInstance.renderIndex(run, 'Docs', entries, 'docs');

            const matches = result.match(/OpenAPI specification/g);
            expect(matches).toHaveLength(1);
        });

        it('should fallback to "API Reference" name when entry name is empty', async () => {
            const run = createMockRun({
                openapiCompanions: [
                    {
                        leadingPage: 'docs/api/index',
                        companionPath: 'docs/api/petstore.openapi.json',
                    },
                ],
            });
            const entries = [
                {
                    href: normalizedPath('api/index.md'),
                    path: normalizedPath('docs/api/index.md'),
                    name: '',
                },
            ];

            const result = await llmsInstance.renderIndex(run, 'Docs', entries, 'docs');

            expect(result).toContain(
                '- [API Reference](api/petstore.openapi.json): OpenAPI specification',
            );
        });

        it('should compute relative path from tocDir to companionPath', async () => {
            const run = createMockRun({
                openapiCompanions: [
                    {
                        leadingPage: 'docs/sub/api/index',
                        companionPath: 'docs/sub/api/spec.openapi.json',
                    },
                ],
            });
            const entries = [
                {
                    href: normalizedPath('sub/api/index.md'),
                    path: normalizedPath('docs/sub/api/index.md'),
                    name: 'Sub API',
                },
            ];

            const result = await llmsInstance.renderIndex(run, 'Docs', entries, 'docs');

            expect(result).toContain(
                '- [Sub API](sub/api/spec.openapi.json): OpenAPI specification',
            );
        });

        it('should add multiple companion links for different leading pages', async () => {
            const run = createMockRun({
                openapiCompanions: [
                    {
                        leadingPage: 'docs/api/index',
                        companionPath: 'docs/api/petstore.openapi.json',
                    },
                    {leadingPage: 'docs/v2/index', companionPath: 'docs/v2/store.openapi.json'},
                ],
            });
            const entries = [
                {
                    href: normalizedPath('api/index.md'),
                    path: normalizedPath('docs/api/index.md'),
                    name: 'Petstore API',
                },
                {
                    href: normalizedPath('v2/index.md'),
                    path: normalizedPath('docs/v2/index.md'),
                    name: 'Store API',
                },
            ];

            const result = await llmsInstance.renderIndex(run, 'Docs', entries, 'docs');

            expect(result).toContain(
                '- [Petstore API](api/petstore.openapi.json): OpenAPI specification',
            );
            expect(result).toContain('- [Store API](v2/store.openapi.json): OpenAPI specification');
        });
    });

    describe('renderFull content aggregator', () => {
        it('should join titles and markdown text together', async () => {
            const run = createMockRun();
            const entries = [
                {
                    href: normalizedPath('page1.md'),
                    path: normalizedPath('docs/page1.md'),
                    name: 'Page 1',
                },
            ];

            const result = await llmsInstance.renderFull(run, 'Full Book', entries);

            expect(result).toContain('# Full Book');
            expect(result).toContain('Collected Markdown Content');
        });

        it('should totally ignore non-markdown documents like yaml files', async () => {
            const run = createMockRun();
            const entries = [
                {
                    href: normalizedPath('index.yaml'),
                    path: normalizedPath('docs/index.yaml'),
                    name: 'Root Config',
                },
            ];

            const result = await llmsInstance.renderFull(run, 'Full Book', entries);

            expect(result.trim()).toBe('# Full Book');
        });

        it('should add all articles when within llmsFullMaxSize limit', async () => {
            const run = createMockRun({llmsFullMaxSize: 1024 * 1024});
            const entries = [
                {
                    href: normalizedPath('page1.md'),
                    path: normalizedPath('docs/page1.md'),
                    name: 'Page 1',
                },
                {
                    href: normalizedPath('page2.md'),
                    path: normalizedPath('docs/page2.md'),
                    name: 'Page 2',
                },
            ];

            const result = await llmsInstance.renderFull(run, 'Full Book', entries);

            expect(result).toContain('# Full Book');
            expect(result).toContain('Collected Markdown Content');
            expect(run.logger.info).not.toHaveBeenCalled();
        });

        it('should stop adding articles and log YFM022 when limit is exceeded', async () => {
            // Set a very small limit so the first article already exceeds it
            const run = createMockRun({llmsFullMaxSize: 10});
            const entries = [
                {
                    href: normalizedPath('page1.md'),
                    path: normalizedPath('docs/page1.md'),
                    name: 'Page 1',
                },
                {
                    href: normalizedPath('page2.md'),
                    path: normalizedPath('docs/page2.md'),
                    name: 'Page 2',
                },
            ];

            const result = await llmsInstance.renderFull(run, 'Full Book', entries);

            // Title is always present
            expect(result).toContain('# Full Book');
            // The first article should NOT be added (it exceeds the 10-byte limit)
            expect(result).not.toContain('Collected Markdown Content');
            // YFM022 should be logged as info
            expect(run.logger.info).toHaveBeenCalledWith(
                'YFM022',
                expect.stringContaining('size limit reached'),
            );
        });

        it('should use default llmsFullMaxSize (4M) when not specified', async () => {
            const run = createMockRun();
            const entries = [
                {
                    href: normalizedPath('page1.md'),
                    path: normalizedPath('docs/page1.md'),
                    name: 'Page 1',
                },
            ];

            const result = await llmsInstance.renderFull(run, 'Full Book', entries);

            expect(result).toContain('# Full Book');
            expect(result).toContain('Collected Markdown Content');
            expect(run.logger.info).not.toHaveBeenCalled();
        });
    });
});
