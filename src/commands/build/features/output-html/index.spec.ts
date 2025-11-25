import type {BuildConfig} from '../..';
import type {FullTap} from 'tapable';

import {describe, expect, it, vi} from 'vitest';

import {Build} from '../..';
import {setupRun} from '../../__tests__';
import {getHooks} from '../../hooks';
import {getHooks as getEntryHooks} from '../../services/entry';

import {OutputHtml} from './index';

describe('OutputHtml feature', () => {
    describe('YFM012 filesize limit exceeded', () => {
        it('should log error when html file size exceeds limit', async () => {
            const build = new Build();
            const feature = new OutputHtml();
            feature.apply(build);

            const run = setupRun({
                content: {
                    maxHtmlSize: 100,
                },
            } as unknown as BuildConfig);

            const largeContent = 'a'.repeat(101);
            const entry = {
                data: {
                    content: {
                        data: {
                            toString: () => largeContent,
                        },
                    },
                },
                path: 'test.html',
                info: {},
            };

            const loggerLintSpy = vi.spyOn(run.logger, 'error');

            const buildHooks = getHooks(build);
            const beforeRunHook = buildHooks.BeforeRun.for('html').taps.find(
                (tap: FullTap) => tap.name === 'Html',
            )?.fn;
            if (beforeRunHook) {
                await beforeRunHook(run);
            }

            const entryHooks = getEntryHooks(run.entry);
            const sizeCheckHook = entryHooks.Dump.taps.find(
                (tap: FullTap) => tap.name === 'Html' && tap.stage === Infinity,
            );
            if (sizeCheckHook) {
                sizeCheckHook.fn(entry);
            }

            expect(loggerLintSpy).toHaveBeenCalledWith(
                'YFM012',
                expect.stringContaining('Filesize limit exceeded'),
            );
        });

        it('should not log error when html file size is within limit', async () => {
            const build = new Build();
            const feature = new OutputHtml();
            feature.apply(build);

            const run = setupRun({
                content: {
                    maxHtmlSize: 100,
                },
            } as unknown as BuildConfig);

            const smallContent = 'a'.repeat(99);
            const entry = {
                data: {
                    content: {
                        data: {
                            toString: () => smallContent,
                        },
                    },
                },
                path: 'test.html',
                info: {},
            };

            const loggerLintSpy = vi.spyOn(run.logger, 'error');

            const buildHooks = getHooks(build);
            const beforeRunHook = buildHooks.BeforeRun.for('html').taps.find(
                (tap: FullTap) => tap.name === 'Html',
            )?.fn;
            if (beforeRunHook) {
                await beforeRunHook(run);
            }

            const entryHooks = getEntryHooks(run.entry);
            const sizeCheckHook = entryHooks.Dump.taps.find(
                (tap: FullTap) => tap.name === 'Html' && tap.stage === Infinity,
            );
            if (sizeCheckHook) {
                sizeCheckHook.fn(entry);
            }

            expect(loggerLintSpy).not.toHaveBeenCalled();
        });
    });
});
