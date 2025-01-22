import {describe, expect, it} from 'vitest';
import {when} from 'vitest-when';
import {join} from 'node:path';
import {dump} from 'js-yaml';

import {setupBuild, setupRun} from '~/commands/build/__tests__';

import {GenericIncluderExtension} from './generic';

const prepareExtension = async (globs: [string, RelativePath, NormalizedPath[]][]) => {
    const build = setupBuild();
    const run = setupRun({});
    const extension = new GenericIncluderExtension();

    for (const [pattern, cwd, files] of globs) {
        when(run.glob)
            .calledWith(
                pattern,
                expect.objectContaining({
                    cwd: join(run.input, cwd),
                }),
            )
            .thenResolve(files);
    }

    extension.apply(build);

    await build.hooks.BeforeAnyRun.promise(run);

    return {build, run, extension};
};

describe('Generic includer', () => {
    it('should work', async () => {
        const {run} = await prepareExtension([
            [
                '**/*.md',
                './test',
                [
                    'index.md',
                    'test.md',
                    'sub/sub-1.md',
                    'sub/sub-2.md',
                    'sub/sub/sub-3.md',
                    'skip/sub/sub-1.md',
                ] as NormalizedPath[],
            ],
        ]);

        const result = await run.toc.hooks.Includer.for('generic').promise(
            {},
            {
                input: './test',
                path: './test/toc.yaml',
            },
            './toc.yaml',
        );

        expect(dump(result)).toMatchSnapshot();
    });

    it('should use top path as input root, if input is not specified', async () => {
        const {run} = await prepareExtension([
            [
                '**/*.md',
                './path/test',
                [
                    'index.md',
                    'test.md',
                    'sub/sub-1.md',
                    'sub/sub-2.md',
                    'sub/sub/sub-3.md',
                    'skip/sub/sub-1.md',
                ] as NormalizedPath[],
            ],
        ]);

        const result = await run.toc.hooks.Includer.for('generic').promise(
            {},
            {
                path: './path/test/toc.yaml',
            },
            './toc.yaml',
        );

        expect(dump(result)).toMatchSnapshot();
    });

    it('should use leadingPage.name option', async () => {
        const {run} = await prepareExtension([
            [
                '**/*.md',
                './test',
                [
                    'index.md',
                    'test.md',
                    'sub/sub-1.md',
                    'sub/sub-2.md',
                    'sub/sub/sub-3.md',
                    'skip/sub/sub-1.md',
                ] as NormalizedPath[],
            ],
        ]);

        const result = await run.toc.hooks.Includer.for('generic').promise(
            {},
            {
                input: './test',
                path: './test/toc.yaml',
                leadingPage: {
                    name: 'Test Overview',
                },
            },
            './toc.yaml',
        );

        expect(dump(result)).toMatchSnapshot();
    });
});
