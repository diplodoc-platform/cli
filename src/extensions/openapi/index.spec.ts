import type {BuildConfig} from '~/commands/build';
import type {FullTap} from 'tapable';

import {describe, expect, it, vi} from 'vitest';

import {Build} from '~/commands/build';
import {setupRun} from '~/commands/build/__tests__';
import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getTocHooks} from '~/core/toc';

import {Extension} from './index';

const STUB_MARKER = 'This page exceeds the maximum allowed size and cannot be displayed.';

vi.mock('@diplodoc/openapi-extension/includer', () => ({
    includer: vi.fn().mockResolvedValue({
        toc: {name: 'openapi', items: []},
        files: [
            {path: 'index.md', content: 'a'.repeat(200)},
            {path: 'endpoint.md', content: 'a'.repeat(50)},
        ],
    }),
}));

describe('OpenAPI extension', () => {
    describe('maxOpenapiIncludeSize', () => {
        async function setup(maxOpenapiIncludeSize: number) {
            const build = new Build();
            const extension = new Extension();
            extension.apply(build);

            const run = setupRun({
                content: {
                    maxOpenapiIncludeSize,
                },
            } as unknown as BuildConfig);

            // Invoke BeforeAnyRun to register the includer hook
            const beforeAnyRunHook = getBaseHooks(build).BeforeAnyRun.taps.find(
                (tap: FullTap) => tap.name === 'OpenapiIncluder',
            )?.fn;

            if (beforeAnyRunHook) {
                beforeAnyRunHook(run);
            }

            // Get the registered includer hook
            const includerHook = getTocHooks(run.toc)
                .Includer.for('openapi')
                .taps.find((tap: FullTap) => tap.name === 'OpenapiIncluder');

            const writeSpy = vi.spyOn(run, 'write').mockResolvedValue();
            const warnSpy = vi.spyOn(run.logger, 'warn');

            const rawtoc = {path: 'toc.yaml' as NormalizedPath, items: []};
            const options = {input: 'spec.yaml', path: 'api/toc.yaml'};

            if (includerHook) {
                await includerHook.fn(rawtoc, options, 'toc.yaml');
            }

            return {writeSpy, warnSpy};
        }

        it('should replace oversized files with stub when limit is set', async () => {
            const {writeSpy, warnSpy} = await setup(100);

            // index.md (200 bytes) should be stubbed
            const stubCall = writeSpy.mock.calls.find((call) =>
                call[1]?.toString().includes(STUB_MARKER),
            );
            expect(stubCall).toBeDefined();

            // Should have logged a warning
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('exceeds max-openapi-include-size limit'),
            );
        });

        it('should preserve small files when limit is set', async () => {
            const {writeSpy} = await setup(100);

            // endpoint.md (50 bytes) should be written as-is
            const preservedCall = writeSpy.mock.calls.find(
                (call) => call[1]?.toString() === 'a'.repeat(50),
            );
            expect(preservedCall).toBeDefined();
        });

        it('should not replace any files when limit is disabled', async () => {
            const {writeSpy, warnSpy} = await setup(0);

            // No stubs should be written
            const stubCall = writeSpy.mock.calls.find((call) =>
                call[1]?.toString().includes(STUB_MARKER),
            );
            expect(stubCall).toBeUndefined();

            // No warnings
            expect(warnSpy).not.toHaveBeenCalled();
        });
    });
});
