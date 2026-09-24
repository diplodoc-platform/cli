import type {BuildConfig} from '~/commands/build';
import type {LeadingPage} from '~/core/leading';
import type {FullTap} from 'tapable';

import {describe, expect, it, vi} from 'vitest';

import {Build} from '~/commands/build';
import {VFile, normalizePath} from '~/core/utils';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {getHooks as getMetaHooks} from '~/core/meta';
import {getHooks as getBaseHooks} from '~/core/program';

import {getHooks as getBuildHooks} from '../../hooks';
import {setupRun} from '../../__tests__';
import {MarkdownOutputRenderer} from '../output-md/renderer';

import {Companions} from './index';

describe('Companions feature', () => {
    it('initializes the ai config group when it is absent', async () => {
        const build = new Build();
        const feature = new Companions();
        feature.apply(build);
        const configTap = tapByName(getBaseHooks(build).Config.taps, 'Companions');
        const config = {} as BuildConfig;
        const result = await configTap(config, {aiMdCompanions: true});

        expect(result).toMatchObject({
            ai: {mdCompanions: true},
        });
    });

    it('does not register processing hooks when disabled', async () => {
        const build = new Build();
        const feature = new Companions();
        feature.apply(build);
        const run = setupRun({ai: {mdCompanions: false}} as BuildConfig);

        await beforeRun(build, run);

        expect(getMarkdownHooks(run.markdown).Dump.taps).toHaveLength(0);
        expect(getLeadingHooks(run.leading).Dump.taps).toHaveLength(0);
        expect(getMetaHooks(run.meta).Dump.taps).toHaveLength(0);
    });

    it('writes Markdown and captured leading companions and advertises them', async () => {
        const build = new Build();
        const feature = new Companions();
        feature.apply(build);
        const run = setupRun({
            ai: {mdCompanions: true},
            baseHref: 'https://example.com/docs/',
        } as BuildConfig);

        vi.spyOn(run.toc, 'isEntry').mockReturnValue(true);
        vi.spyOn(MarkdownOutputRenderer.prototype, 'renderMarkdown').mockResolvedValue();
        vi.spyOn(MarkdownOutputRenderer.prototype, 'renderLeading').mockResolvedValue();
        vi.mocked(run.write).mockResolvedValue();

        await beforeRun(build, run);

        const meta = await getMetaHooks(run.meta).Dump.promise({}, normalizePath('guide.md'));
        expect(meta.alternate).toContainEqual({
            href: 'https://example.com/docs/guide.md',
            type: 'text/markdown',
            title: 'Markdown version',
        });
        await expect(
            getMetaHooks(run.meta).Dump.promise(meta, normalizePath('guide.md')),
        ).resolves.toEqual(meta);
        expect(meta.alternate).toHaveLength(1);

        await getMarkdownHooks(run.markdown).Dump.promise(
            new VFile<string>(normalizePath('guide.md'), '# Guide'),
        );
        expect(MarkdownOutputRenderer.prototype.renderMarkdown).toHaveBeenCalledOnce();
        expect(run.write).toHaveBeenCalledWith(
            expect.stringMatching(/guide\.md$/),
            '# Guide',
            true,
        );

        const plugins = await getLeadingHooks(run.leading).Plugins.promise([]);
        const leading: LeadingPage = {title: 'Landing', links: []};
        plugins[0].call({path: normalizePath('landing.yaml')} as never, leading);
        await getLeadingHooks(run.leading).Dump.promise(
            new VFile<LeadingPage>(normalizePath('landing.yaml'), {
                ...leading,
                title: 'HTML landing',
            }),
        );

        expect(MarkdownOutputRenderer.prototype.renderLeading).toHaveBeenCalledOnce();
        expect(run.write).toHaveBeenCalledWith(
            expect.stringMatching(/landing\.yaml$/),
            expect.stringContaining('Landing'),
            true,
        );

        vi.mocked(run.write).mockClear();
        vi.mocked(MarkdownOutputRenderer.prototype.renderMarkdown).mockClear();
        await getMarkdownHooks(run.markdown).Dump.promise(
            new VFile<string>(normalizePath('asset.txt'), 'asset'),
        );
        expect(MarkdownOutputRenderer.prototype.renderMarkdown).not.toHaveBeenCalled();
        expect(run.write).not.toHaveBeenCalled();
    });

    it('does not advertise include metadata as a companion', async () => {
        const build = new Build();
        const feature = new Companions();
        feature.apply(build);
        const run = setupRun({ai: {mdCompanions: true}} as BuildConfig);
        vi.spyOn(run.toc, 'isEntry').mockReturnValue(false);

        await beforeRun(build, run);

        await expect(
            getMetaHooks(run.meta).Dump.promise({}, normalizePath('_includes/shared.md')),
        ).resolves.toEqual({});
    });

    it('fails explicitly when a leading source was not captured', async () => {
        const build = new Build();
        const feature = new Companions();
        feature.apply(build);
        const run = setupRun({ai: {mdCompanions: true}} as BuildConfig);

        await beforeRun(build, run);

        await expect(
            getLeadingHooks(run.leading).Dump.promise(
                new VFile<LeadingPage>(normalizePath('landing.yaml'), {
                    title: 'Landing',
                    links: [],
                }),
            ),
        ).rejects.toThrow('Unable to capture leading source for companion: landing.yaml');
    });
});

function tapByName(taps: FullTap[], name: string) {
    const tap = taps.find((item) => item.name === name);
    if (!tap) {
        throw new Error(`tap ${name} not registered`);
    }

    return tap.fn;
}

async function beforeRun(build: Build, run: ReturnType<typeof setupRun>) {
    const hook = getBuildHooks(build)
        .BeforeRun.for('html')
        .taps.find((tap: FullTap) => tap.name === 'Companions')?.fn;

    await hook?.(run);
}
