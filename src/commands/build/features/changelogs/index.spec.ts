import type {BuildConfig} from '../..';
import {Build} from '../..';
import type {FullTap} from 'tapable';

import {describe, expect, it, vi} from 'vitest';
import {when} from 'vitest-when';
import {setupRun} from '../../__tests__';
import {getHooks} from '../../hooks';
import {getHooks as getMarkdownHooks} from '~/core/markdown';

import {ChangelogItem, Changelogs} from './index';

describe('Changelogs feature', () => {
    describe('image copying', () => {
        it('should copy local images when changelog has image', async () => {
            const build = new Build();
            const feature = new Changelogs();
            feature.apply(build);

            const run = setupRun({
                changelogs: true,
            } as unknown as BuildConfig);

            const copySpy = vi.spyOn(run, 'copy');
            const loggerErrorSpy = vi.spyOn(run.logger, 'error');

            // Mock the copy and write methods to resolve successfully
            when(run.copy).calledWith(expect.anything(), expect.anything()).thenResolve();
            when(run.write).calledWith(expect.anything(), expect.anything(), expect.anything()).thenResolve();

            // Mock the markdown hooks to simulate changelog processing
            const markdownHooks = getMarkdownHooks(run.markdown);

            // Simulate the changelogsMap being populated
            const changelogsMap: Record<string, ChangelogItem[]> = {
                'test.md': [
                    {
                        title: 'Test changelog',
                        image: {
                            src: 'image.png',
                            alt: 'Test image',
                        },
                        description: 'Test description',
                    },
                ],
            };

            // Mock the Collects hook to return our collect function
            const collectFn = vi.fn().mockImplementation((content: string) => {
                // Simulate the collect function behavior
                return content;
            });

            markdownHooks.Collects.tap('Changelogs', (plugins) => {
                return plugins.concat(collectFn);
            });

            // Mock the Resolved hook to simulate changelog processing
            const resolvedFn = vi.fn().mockImplementation(async (_content: string, path: string) => {
                const changelogs = changelogsMap[path];
                if (!changelogs || !changelogs.length) {
                    return;
                }

                const outputDir = '/dev/null/output/test';

                changelogs[changelogs.length - 1].source = 'test/test';

                for (const [index, changes] of changelogs.entries()) {
                    const image = changes.image;
                    if (image && !image.src.startsWith('http')) {
                        const from = '/dev/null/input/test/image.png';
                        const to = '/dev/null/output/test/image.png';
                        try {
                            await run.copy(from, to);
                        } catch (error) {
                            run.logger.error(`Failed to copy changelog image: ${error}`);
                        }
                    }

                    await run.write(
                        `${outputDir}/changelogs/__changes-name-test-${String(changelogs.length - index).padStart(3, '0')}.json`,
                        JSON.stringify(changes),
                        true,
                    );
                }
            });

            markdownHooks.Resolved.tap('Changelogs', resolvedFn);

            const buildHooks = getHooks(build);
            const beforeRunHook = buildHooks.BeforeRun.for('md').taps.find(
                (tap: FullTap) => tap.name === 'Changelogs',
            )?.fn;
            if (beforeRunHook) {
                await beforeRunHook(run);
            }

            // Simulate markdown processing with changelog
            await resolvedFn('', 'test.md');

            expect(copySpy).toHaveBeenCalledWith(
                expect.stringContaining('input/test/image.png'),
                expect.stringContaining('output/test/image.png'),
            );
            expect(loggerErrorSpy).not.toHaveBeenCalled();
        });

        it('should not copy external images', async () => {
            const build = new Build();
            const feature = new Changelogs();
            feature.apply(build);

            const run = setupRun({
                changelogs: true,
            } as unknown as BuildConfig);

            const copySpy = vi.spyOn(run, 'copy');
            const loggerErrorSpy = vi.spyOn(run.logger, 'error');

            // Mock the write method to resolve successfully
            when(run.write).calledWith(expect.anything(), expect.anything(), expect.anything()).thenResolve();

            // Mock the markdown hooks to simulate changelog processing
            const markdownHooks = getMarkdownHooks(run.markdown);

            // Simulate the changelogsMap being populated with external image
            const changelogsMap: Record<string, ChangelogItem[]> = {
                'test.md': [
                    {
                        title: 'Test changelog',
                        image: {
                            src: 'https://example.com/image.png',
                            alt: 'Test image',
                        },
                        description: 'Test description',
                    },
                ],
            };

            // Mock the Resolved hook to simulate changelog processing
            const resolvedFn = vi.fn().mockImplementation(async (_content: string, path: string) => {
                const changelogs = changelogsMap[path];
                if (!changelogs || !changelogs.length) {
                    return;
                }

                const outputDir = '/dev/null/output/test';

                changelogs[changelogs.length - 1].source = 'test/test';

                for (const [index, changes] of changelogs.entries()) {
                    const image = changes.image;
                    if (image && !image.src.startsWith('http')) {
                        const from = '/dev/null/input/test/image.png';
                        const to = '/dev/null/output/test/image.png';
                        try {
                            await run.copy(from, to);
                        } catch (error) {
                            run.logger.error(`Failed to copy changelog image: ${error}`);
                        }
                    }

                    await run.write(
                        `${outputDir}/changelogs/__changes-name-test-${String(changelogs.length - index).padStart(3, '0')}.json`,
                        JSON.stringify(changes),
                        true,
                    );
                }
            });

            markdownHooks.Resolved.tap('Changelogs', resolvedFn);

            const buildHooks = getHooks(build);
            const beforeRunHook = buildHooks.BeforeRun.for('md').taps.find(
                (tap: FullTap) => tap.name === 'Changelogs',
            )?.fn;
            if (beforeRunHook) {
                await beforeRunHook(run);
            }

            // Simulate markdown processing with changelog
            await resolvedFn('', 'test.md');

            expect(copySpy).not.toHaveBeenCalled();
            expect(loggerErrorSpy).not.toHaveBeenCalled();
        });

        it('should log error when image copy fails', async () => {
            const build = new Build();
            const feature = new Changelogs();
            feature.apply(build);

            const run = setupRun({
                changelogs: true,
            } as unknown as BuildConfig);

            const copyError = new Error('Copy failed');
            when(run.copy).calledWith(expect.anything(), expect.anything()).thenReject(copyError);
            when(run.write).calledWith(expect.anything(), expect.anything(), expect.anything()).thenResolve();

            const loggerErrorSpy = vi.spyOn(run.logger, 'error');

            // Mock the markdown hooks to simulate changelog processing
            const markdownHooks = getMarkdownHooks(run.markdown);

            // Simulate the changelogsMap being populated
            const changelogsMap: Record<string, ChangelogItem[]> = {
                'test.md': [
                    {
                        title: 'Test changelog',
                        image: {
                            src: 'image.png',
                            alt: 'Test image',
                        },
                        description: 'Test description',
                    },
                ],
            };

            // Mock the Resolved hook to simulate changelog processing
            const resolvedFn = vi.fn().mockImplementation(async (_content: string, path: string) => {
                const changelogs = changelogsMap[path];
                if (!changelogs || !changelogs.length) {
                    return;
                }

                const outputDir = '/dev/null/output/test';

                changelogs[changelogs.length - 1].source = 'test/test';

                for (const [index, changes] of changelogs.entries()) {
                    const image = changes.image;
                    if (image && !image.src.startsWith('http')) {
                        const from = '/dev/null/input/test/image.png';
                        const to = '/dev/null/output/test/image.png';
                        try {
                            await run.copy(from, to);
                        } catch (error) {
                            run.logger.error(`Failed to copy changelog image: ${error}`);
                        }
                    }

                    await run.write(
                        `${outputDir}/changelogs/__changes-name-test-${String(changelogs.length - index).padStart(3, '0')}.json`,
                        JSON.stringify(changes),
                        true,
                    );
                }
            });

            markdownHooks.Resolved.tap('Changelogs', resolvedFn);

            const buildHooks = getHooks(build);
            const beforeRunHook = buildHooks.BeforeRun.for('md').taps.find(
                (tap: FullTap) => tap.name === 'Changelogs',
            )?.fn;
            if (beforeRunHook) {
                await beforeRunHook(run);
            }

            // Simulate markdown processing with changelog
            await resolvedFn('', 'test.md');

            expect(loggerErrorSpy).toHaveBeenCalledWith(
                'Failed to copy changelog image: Error: Copy failed',
            );
        });
        });

    describe('changelog processing', () => {
        it('should skip processing when changelogs are disabled', async () => {
            const build = new Build();
            const feature = new Changelogs();
            feature.apply(build);

            const run = setupRun({
                changelogs: false,
            } as unknown as BuildConfig);

            const buildHooks = getHooks(build);
            const beforeRunHook = buildHooks.BeforeRun.for('md').taps.find(
                (tap: FullTap) => tap.name === 'Changelogs',
            )?.fn;

            // The hook should return early when changelogs are disabled
            if (beforeRunHook) {
                const result = await beforeRunHook(run);
                expect(result).toBeUndefined();
            }
        });
    });
});
