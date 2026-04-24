import type {FullTap} from 'tapable';

import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';

import {Build, getHooks as getBuildHooks, getEntryHooks} from '~/commands/build';
import {setupRun} from '~/commands/build/__tests__';
import {withConfigUtils} from '~/core/config';
import {Template} from '~/core/template';

import {NAME} from './config';

import {Extension} from './index';

/** Apply the extension to a fresh Build, set config, return both. */
function setup(textFeedback: unknown) {
    const build = new Build();
    new Extension().apply(build);
    // Config is readonly, bypass via string key to avoid @ts-ignore spread
    (build as Record<string, unknown>)['config'] = withConfigUtils(null, {textFeedback});
    return build;
}

/** Invoke the BeforeRun.for('html') tap registered by TextFeedback. */
async function fireBeforeRun(build: Build) {
    const run = setupRun({} as never);
    const tap = getBuildHooks(build)
        .BeforeRun.for('html')
        .taps.find((t: FullTap) => t.name === NAME);
    await tap?.fn(run);
    return run;
}

/** Invoke the Page tap that BeforeRun registered on the entry, return dumped HTML. */
function renderPage(run: ReturnType<typeof setupRun>): string {
    const template = new Template('index.html' as RelativePath, 'en');
    const tap = getEntryHooks(run.entry).Page.taps.find((t: FullTap) => t.name === NAME);
    tap?.fn(template);
    return template.dump();
}

describe('TextFeedback Extension — HTML script injection', () => {
    describe('when textFeedback is configured', () => {
        const ENDPOINT = 'https://feedback.example.com/api';

        it('injects the browser bundle <script> tag', async () => {
            const build = setup(ENDPOINT);
            const run = await fireBeforeRun(build);
            const html = renderPage(run);

            expect(html).toContain(join('_extensions', 'feedback', 'feedback.js'));
        });

        it('injects the inline init script with the endpoint', async () => {
            const build = setup(ENDPOINT);
            const run = await fireBeforeRun(build);
            const html = renderPage(run);

            expect(html).toContain('window.feedbackExtensionInit(');
            expect(html).toContain(`"customFormEndpoint":"${ENDPOINT}"`);
        });

        it('adds connect-src CSP directive for the endpoint origin', async () => {
            const build = setup(ENDPOINT);
            const run = await fireBeforeRun(build);
            const html = renderPage(run);

            expect(html).toContain('connect-src');
            expect(html).toContain('https://feedback.example.com');
        });

        it('includes metrika config in the init script when provided', async () => {
            const metrika = {counterId: 12345678, goals: {button: 'my-btn'}};
            const build = setup({endpoint: ENDPOINT, metrika});
            const run = await fireBeforeRun(build);
            const html = renderPage(run);

            expect(html).toContain('"counterId":12345678');
            expect(html).toContain('"button":"my-btn"');
        });

        it('omits metrika key from init script when not provided', async () => {
            const build = setup(ENDPOINT);
            const run = await fireBeforeRun(build);
            const html = renderPage(run);

            // metrika should be null/absent — no counterId in output
            expect(html).not.toContain('"counterId"');
        });
    });

    describe('when textFeedback is not configured', () => {
        it('does not register a Page tap', async () => {
            const build = setup(undefined);
            const run = await fireBeforeRun(build);

            const pageTap = getEntryHooks(run.entry).Page.taps.find(
                (t: FullTap) => t.name === NAME,
            );
            expect(pageTap).toBeUndefined();
        });

        it('produces HTML without the feedback bundle script', async () => {
            const build = setup(undefined);
            const run = await fireBeforeRun(build);
            const html = renderPage(run);

            expect(html).not.toContain('feedback.js');
            expect(html).not.toContain('feedbackExtensionInit');
        });
    });

    describe('AfterRun — browser bundle copying', () => {
        it('copies feedback.js to the output directory when configured', async () => {
            const build = setup('https://feedback.example.com/api');
            const run = setupRun({output: '/out'} as never);
            const copySpy = vi.spyOn(run, 'copy').mockResolvedValue([]);

            const tap = getBuildHooks(build)
                .AfterRun.for('html')
                .taps.find((t: FullTap) => t.name === NAME);
            await tap?.fn(run);

            expect(copySpy).toHaveBeenCalledOnce();
            expect(copySpy).toHaveBeenCalledWith(
                expect.stringContaining('feedback.js'),
                expect.stringContaining(join('_extensions', 'feedback', 'feedback.js')),
            );
        });

        it('skips copying when textFeedback is not configured', async () => {
            const build = setup(undefined);
            const run = setupRun({} as never);
            const copySpy = vi.spyOn(run, 'copy').mockResolvedValue([]);

            const tap = getBuildHooks(build)
                .AfterRun.for('html')
                .taps.find((t: FullTap) => t.name === NAME);
            await tap?.fn(run);

            expect(copySpy).not.toHaveBeenCalled();
        });
    });
});
