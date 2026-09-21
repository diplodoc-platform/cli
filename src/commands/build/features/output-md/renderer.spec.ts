import type {BuildConfig} from '~/commands/build';
import type {LeadingPage} from '~/core/leading';

import {describe, expect, it, vi} from 'vitest';

import {VFile, normalizePath} from '~/core/utils';
import {setupRun} from '~/commands/build/__tests__';

import {MarkdownCollector} from './collect';
import {MarkdownOutputRenderer, prepareMarkdownMeta} from './renderer';

const baseConfig = {
    preprocess: {
        hashIncludes: false,
        mergeIncludes: false,
        mergeAutotitles: true,
        mergeSvg: false,
        disableMetaMaxLineWidth: false,
        mergeIncludesSourceMaps: false,
    },
    content: {maxAssetSize: 100},
    llms: {enabled: true, llmsFullMaxSize: 1024},
};

describe('MarkdownOutputRenderer', () => {
    it('prepares the same Markdown metadata from a hook or a snapshot', () => {
        const run = setupRun({
            ...baseConfig,
            baseHref: 'https://example.com/docs/',
        } as unknown as BuildConfig);
        vi.spyOn(run.toc, 'for').mockReturnValue({path: 'toc.yaml'} as never);
        vi.mocked(run.exists).mockReturnValue(false);

        expect(
            prepareMarkdownMeta(
                run,
                {alternate: [{href: 'guide.html', hreflang: 'en'}]},
                normalizePath('guide.md'),
            ),
        ).toEqual({
            alternate: [
                'https://example.com/docs/guide',
                {
                    href: 'https://example.com/docs/guide.md',
                    title: 'Markdown version',
                    type: 'text/markdown',
                },
                {href: 'https://example.com/docs/llms.txt', rel: 'describedby'},
            ],
        });
    });

    it('renders a human Markdown companion and copies bounded media assets once', async () => {
        const run = setupRun(baseConfig as unknown as BuildConfig);
        vi.spyOn(run.toc, 'for').mockReturnValue({path: 'toc.yaml'} as never);
        vi.spyOn(run.toc, 'isEntry').mockImplementation((path) => path.endsWith('.md'));
        vi.mocked(run.exists).mockReturnValue(false);
        vi.mocked(run.copy).mockResolvedValue([]);
        vi.spyOn(run.meta, 'snapshot').mockReturnValue({description: 'Prepared page'});
        vi.spyOn(run.markdown, 'assets').mockResolvedValue([
            asset('image.png', 10),
            asset('large.jpg', 101),
            asset('guide.md', 1, 'link'),
        ]);
        vi.spyOn(MarkdownCollector.prototype, 'collect').mockResolvedValue(`
:::visibility human
Human content.
:::

:::visibility agent
Agent content.
:::
`);

        const renderer = new MarkdownOutputRenderer(run, {
            metaSource: 'snapshot',
            audience: 'human',
        });
        const first = new VFile<string>(normalizePath('guide.md'), 'source');
        const second = new VFile<string>(normalizePath('guide.md'), 'source');

        await renderer.renderMarkdown(first);
        await renderer.renderMarkdown(second);

        expect(first.data).toContain('description: Prepared page');
        expect(first.data).toContain('Human content.');
        expect(first.data).not.toContain('Agent content.');
        expect(run.copy).toHaveBeenCalledTimes(2);
        expect(run.logger.error).toHaveBeenCalledWith(
            'YFM013',
            expect.stringContaining('large.jpg'),
        );
    });

    it('adds prepared metadata to a leading companion', async () => {
        const run = setupRun(baseConfig as unknown as BuildConfig);
        vi.spyOn(run.toc, 'for').mockReturnValue({path: 'toc.yaml'} as never);
        vi.mocked(run.exists).mockReturnValue(false);
        vi.spyOn(run.meta, 'snapshot').mockReturnValue({description: 'Landing metadata'});
        vi.spyOn(run.leading, 'assets').mockResolvedValue([]);

        const renderer = new MarkdownOutputRenderer(run, {metaSource: 'snapshot'});
        const vfile = new VFile<LeadingPage>(normalizePath('landing.yaml'), {
            title: 'Landing',
            links: [],
        });

        await renderer.renderLeading(vfile);

        expect(vfile.data.meta).toMatchObject({description: 'Landing metadata'});
    });
});

function asset(path: string, size: number, type: 'link' | 'image' = 'image') {
    return {
        path: normalizePath(path),
        size,
        type,
        hash: null,
        search: null,
        title: '',
        autotitle: false,
        location: [0, 0] as [number, number],
    };
}
