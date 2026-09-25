import type {Build, Run} from '~/commands/build';

import {beforeEach, describe, expect, it, vi} from 'vitest';

const captures = vi.hoisted(() => {
    const state = {
        commandTaps: [] as Array<() => void>,
        configTaps: [] as Array<
            (config: Record<string, unknown>, args: Record<string, unknown>) => unknown
        >,
        afterRunTaps: [] as Array<(run: Run) => Promise<void>>,
    };

    return state;
});

vi.mock('~/core/program', () => ({
    getHooks: () => ({
        Command: {
            tap: (_name: string, fn: () => void) => captures.commandTaps.push(fn),
        },
        Config: {
            tap: (
                _name: string,
                fn: (config: Record<string, unknown>, args: Record<string, unknown>) => unknown,
            ) => captures.configTaps.push(fn),
        },
    }),
}));

vi.mock('~/commands/build', () => ({
    getHooks: () => ({
        AfterRun: {
            for: () => ({
                tapPromise: (_name: string, fn: (run: Run) => Promise<void>) =>
                    captures.afterRunTaps.push(fn),
            }),
        },
    }),
}));

import {Sitemap} from './index';

type MockRunOptions = {
    sitemap?: boolean;
    baseHref?: string;
    singlePage?: boolean;
    entries?: string[];
    meta?: Record<string, {noIndex?: boolean}>;
    files?: Record<string, string>;
};

function createMockRun(options: MockRunOptions = {}): Run {
    return {
        config: {
            sitemap: options.sitemap ?? true,
            baseHref: options.baseHref,
            singlePage: options.singlePage ?? false,
        },
        input: '/input',
        output: '/output',
        toc: {
            entries: options.entries ?? ['ru/index.md', 'ru/guide.md'],
        },
        meta: {
            get: vi.fn().mockImplementation((path: string) => options.meta?.[path] ?? {}),
            dump: vi.fn().mockResolvedValue({}),
        },
        read: vi.fn().mockImplementation((path: string) => {
            const file = Object.keys(options.files ?? {}).find((name) => path.endsWith(name));

            return file ? (options.files as Record<string, string>)[file] : '';
        }),
        write: vi.fn().mockResolvedValue(undefined),
        logger: {
            warn: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
        },
    } as unknown as Run;
}

const afterRun = () => captures.afterRunTaps[0];

const resolveConfig = (config: Record<string, unknown>, args: Record<string, unknown>) =>
    captures.configTaps[0](config, args);

describe('Sitemap config resolution', () => {
    beforeEach(() => {
        captures.commandTaps.length = 0;
        captures.configTaps.length = 0;
        captures.afterRunTaps.length = 0;

        new Sitemap().apply({} as Build);
    });

    it('registers the --sitemap option', () => {
        expect(captures.commandTaps).toHaveLength(1);
    });

    it('is disabled by default', () => {
        expect(resolveConfig({}, {})).toMatchObject({sitemap: false});
    });

    it('takes the .yfm value', () => {
        expect(resolveConfig({sitemap: true}, {})).toMatchObject({sitemap: true});
    });

    it('lets the cli value override .yfm', () => {
        expect(resolveConfig({sitemap: true}, {sitemap: false})).toMatchObject({sitemap: false});
        expect(resolveConfig({sitemap: false}, {sitemap: true})).toMatchObject({sitemap: true});
    });
});

describe('Sitemap generation', () => {
    beforeEach(() => {
        captures.afterRunTaps.length = 0;

        new Sitemap().apply({} as Build);
    });

    it('does not write anything when disabled', async () => {
        const run = createMockRun({sitemap: false, baseHref: 'https://example.com/docs/'});

        await afterRun()(run);

        expect(run.write).not.toHaveBeenCalled();
    });

    it('writes sitemap.xml with absolute urls', async () => {
        const run = createMockRun({baseHref: 'https://example.com/docs/'});

        await afterRun()(run);

        expect(run.write).toHaveBeenCalledTimes(1);
        expect(vi.mocked(run.write).mock.calls[0][0]).toBe('/output/sitemap.xml');
        expect(vi.mocked(run.write).mock.calls[0][1] as string).toContain(
            '<loc>https://example.com/docs/ru/guide.html</loc>',
        );
        expect(vi.mocked(run.write).mock.calls[0][1] as string).toContain(
            '<loc>https://example.com/docs/ru/index.html</loc>',
        );
    });

    it('skips generation and warns when baseHref is missing', async () => {
        const run = createMockRun({baseHref: undefined});

        await afterRun()(run);

        expect(run.write).not.toHaveBeenCalled();
        expect(run.logger.warn).toHaveBeenCalledTimes(1);
    });

    it('skips singlepage builds', async () => {
        const run = createMockRun({baseHref: 'https://example.com/docs/', singlePage: true});

        await afterRun()(run);

        expect(run.write).not.toHaveBeenCalled();
    });

    it('drops pages excluded by meta', async () => {
        const run = createMockRun({
            baseHref: 'https://example.com/docs/',
            entries: ['ru/index.md', 'ru/secret.md'],
            meta: {'ru/secret.md': {noIndex: true}},
        });

        await afterRun()(run);

        const xml = vi.mocked(run.write).mock.calls[0][1] as string;

        expect(xml).toContain('<loc>https://example.com/docs/ru/index.html</loc>');
        expect(xml).not.toContain('secret');
    });

    it('drops pages excluded by front matter', async () => {
        const run = createMockRun({
            baseHref: 'https://example.com/docs/',
            entries: ['ru/index.md', 'ru/secret.md'],
            files: {'ru/secret.md': '---\nnoIndex: true\n---\n# Secret\n'},
        });

        await afterRun()(run);

        const xml = vi.mocked(run.write).mock.calls[0][1] as string;

        expect(xml).toContain('<loc>https://example.com/docs/ru/index.html</loc>');
        expect(xml).not.toContain('secret');
    });

    it('keeps pages that cannot be inspected', async () => {
        const run = createMockRun({
            baseHref: 'https://example.com/docs/',
            entries: ['ru/index.md', 'ru/broken.md'],
        });

        vi.mocked(run.read).mockRejectedValue(new Error('EACCES'));

        await afterRun()(run);

        const xml = vi.mocked(run.write).mock.calls[0][1] as string;

        expect(xml).toContain('<loc>https://example.com/docs/ru/broken.html</loc>');
    });
});
