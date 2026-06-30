import type {Run} from '~/commands/build';
import type {LlmsConfig} from './index';

import {beforeEach, describe, expect, it, vi} from 'vitest';

import {OutputFormat} from '~/commands/build/config';

import {LLMS_FULL_FILENAME, Llms} from './index';

vi.mock('~/core/utils', () => ({
    normalizePath: (path: string) => path as NormalizedPath,
    setExt: (path: string, ext: string) => path.replace(/\.[^/.]+$/, `.${ext}`),
}));

vi.mock('~/core/program', () => ({
    getHooks: () => ({
        Command: {tap: vi.fn()},
        Config: {tap: vi.fn()},
        AfterAnyRun: {tapPromise: vi.fn()},
    }),
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
    } = {},
): Run {
    return {
        config: {
            outputFormat: options.outputFormat ?? OutputFormat.html,
            llms: {
                enabled: options.enabled ?? true,
                description: options.description ?? 'AI Assistant Context Description',
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
        },
    } as unknown as Run;
}

describe('LLMs Plugin Architecture', () => {
    let llmsInstance: any;

    beforeEach(() => {
        llmsInstance = new Llms();
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

            const result = await llmsInstance.renderIndex(run, 'My Product Docs', entries);

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

            const result = await llmsInstance.renderIndex(run, 'MD Project', entries);

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

            const result = await llmsInstance.renderIndex(run, 'Fallback Title', entries);

            expect(result).toContain('- [Meta Title Target](root.html)');
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
    });
});
