import type {BuildConfig} from '~/commands/build';

import {describe, expect, it, vi} from 'vitest';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {setupRun} from '~/commands/build/__tests__';
import {Build} from '~/commands/build';

import {METRIKA_CSP_RULES} from './constants';

import {Analytics, NAME} from './index';

async function setupAnalyticsTest(config: Partial<BuildConfig>) {
    const build = new Build();
    const feature = new Analytics();

    feature.apply(build);

    const run = setupRun(config);
    const addResourcesSpy = vi.spyOn(run.meta, 'addResources');

    const beforeAnyRunHook = getBaseHooks(build).BeforeAnyRun.taps.find((tap) => {
        return tap.name === NAME;
    });

    if (!beforeAnyRunHook) {
        throw new Error('BeforeAnyRun hook not found');
    }

    await beforeAnyRunHook.fn(run);

    const leadingLoadedHook = getLeadingHooks(run.leading).Loaded.taps.find((tap) => {
        return tap.name === NAME;
    });

    if (!leadingLoadedHook) {
        throw new Error('Leading hook not found');
    }

    const markdownLoadedHook = getMarkdownHooks(run.markdown).Loaded.taps.find((tap) => {
        return tap.name === NAME;
    });

    if (!markdownLoadedHook) {
        throw new Error('Markdown hook not found');
    }

    return {
        addResourcesSpy,
        callLeadingHook: () => {
            return leadingLoadedHook.fn('content', {} as never, 'index.yaml' as NormalizedPath);
        },
        callMarkdownHook: () => {
            return markdownLoadedHook.fn('content', {} as never, 'index.md' as NormalizedPath);
        },
    };
}

describe('Analytics feature', () => {
    describe('CSP rules', () => {
        it('should not add CSP rules when metrika is not configured', async () => {
            const {callLeadingHook, callMarkdownHook, addResourcesSpy} = await setupAnalyticsTest(
                {},
            );

            callLeadingHook();
            callMarkdownHook();

            expect(addResourcesSpy).not.toHaveBeenCalled();
        });

        it('should not add CSP rules when metrika is empty array', async () => {
            const {callLeadingHook, callMarkdownHook, addResourcesSpy} = await setupAnalyticsTest({
                analytics: {metrika: []},
            });

            callLeadingHook();
            callMarkdownHook();

            expect(addResourcesSpy).not.toHaveBeenCalled();
        });

        it('should not add CSP rules when metrika counter has no valid id', async () => {
            const {callLeadingHook, callMarkdownHook, addResourcesSpy} = await setupAnalyticsTest({
                analytics: {
                    // @ts-expect-error
                    metrika: [{id: '123456'}],
                },
            });

            callLeadingHook();
            callMarkdownHook();

            expect(addResourcesSpy).not.toHaveBeenCalled();
        });

        it('should add CSP rules when metrika counter with valid id is configured', async () => {
            const {callLeadingHook, callMarkdownHook, addResourcesSpy} = await setupAnalyticsTest({
                analytics: {
                    metrika: [{id: 123456}],
                },
            });

            callLeadingHook();

            expect(addResourcesSpy).toBeCalledTimes(1);
            expect(addResourcesSpy).toHaveBeenCalledWith(expect.anything(), {
                csp: [METRIKA_CSP_RULES],
            });

            callMarkdownHook();

            expect(addResourcesSpy).toBeCalledTimes(2);
            expect(addResourcesSpy).toHaveBeenCalledWith(expect.anything(), {
                csp: [METRIKA_CSP_RULES],
            });
        });
    });
});
