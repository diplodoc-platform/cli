import {describe, expect, it} from 'vitest';
import {when} from 'vitest-when';
import {join} from 'node:path';
import {dump} from 'js-yaml';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getTocHooks} from '~/core/toc';
import {setupBuild, setupRun} from '~/commands/build/__tests__';

import {Extension} from '.';

const prepareExtension = async (globs: [string, RelativePath, NormalizedPath[]][]) => {
    const build = setupBuild();
    const run = setupRun({});
    const extension = new Extension();

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

    build.apply();
    extension.apply(build);

    await getBaseHooks(build).BeforeAnyRun.promise(run);

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

        const result = await getTocHooks(run.toc)
            .Includer.for('generic')
            .promise(
                {path: 'toc.yaml' as NormalizedPath},
                {
                    input: './test',
                    path: './test/toc.yaml',
                },
                'toc.yaml' as NormalizedPath,
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

        const result = await getTocHooks(run.toc)
            .Includer.for('generic')
            .promise(
                {path: 'toc.yaml' as NormalizedPath},
                {
                    path: './path/test/toc.yaml',
                },
                'toc.yaml' as NormalizedPath,
            );

        expect(dump(result)).toMatchSnapshot();
    });

    it('should use autotitle option', async () => {
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

        const result = await getTocHooks(run.toc)
            .Includer.for('generic')
            .promise(
                {path: 'toc.yaml' as NormalizedPath},
                {
                    input: './test',
                    path: './test/toc.yaml',
                    autotitle: false,
                },
                'toc.yaml' as NormalizedPath,
            );

        expect(dump(result)).toMatchSnapshot();
    });

    it('should sort numeric filenames with orderBy=natural', async () => {
        const {run} = await prepareExtension([
            [
                '**/*.md',
                './test',
                ['10.md', '2.md', '1.md', '20.md', '11.md', '100.md', '9.md'] as NormalizedPath[],
            ],
        ]);

        const result = await getTocHooks(run.toc)
            .Includer.for('generic')
            .promise(
                {path: 'toc.yaml' as NormalizedPath},
                {
                    input: './test',
                    path: './test/toc.yaml',
                    autotitle: false,
                    orderBy: 'natural',
                },
                'toc.yaml' as NormalizedPath,
            );

        expect(dump(result)).toMatchSnapshot();
    });

    it('should sort with orderBy=filename lexicographically', async () => {
        const {run} = await prepareExtension([
            [
                '**/*.md',
                './test',
                ['10.md', '2.md', '1.md', '20.md', '11.md', '100.md', '9.md'] as NormalizedPath[],
            ],
        ]);

        const result = await getTocHooks(run.toc)
            .Includer.for('generic')
            .promise(
                {path: 'toc.yaml' as NormalizedPath},
                {
                    input: './test',
                    path: './test/toc.yaml',
                    autotitle: false,
                    orderBy: 'filename',
                },
                'toc.yaml' as NormalizedPath,
            );

        expect(dump(result)).toMatchSnapshot();
    });

    it('should sort in descending order with order=desc', async () => {
        const {run} = await prepareExtension([
            ['**/*.md', './test', ['1.md', '2.md', '10.md', '20.md'] as NormalizedPath[]],
        ]);

        const result = await getTocHooks(run.toc)
            .Includer.for('generic')
            .promise(
                {path: 'toc.yaml' as NormalizedPath},
                {
                    input: './test',
                    path: './test/toc.yaml',
                    autotitle: false,
                    orderBy: 'natural',
                    order: 'desc',
                },
                'toc.yaml' as NormalizedPath,
            );

        expect(dump(result)).toMatchSnapshot();
    });

    it('should sort nested directories naturally', async () => {
        const {run} = await prepareExtension([
            [
                '**/*.md',
                './test',
                [
                    'chapter-10/intro.md',
                    'chapter-2/intro.md',
                    'chapter-1/intro.md',
                    'chapter-1/section-10.md',
                    'chapter-1/section-2.md',
                    'chapter-1/section-1.md',
                ] as NormalizedPath[],
            ],
        ]);

        const result = await getTocHooks(run.toc)
            .Includer.for('generic')
            .promise(
                {path: 'toc.yaml' as NormalizedPath},
                {
                    input: './test',
                    path: './test/toc.yaml',
                    autotitle: false,
                    orderBy: 'natural',
                },
                'toc.yaml' as NormalizedPath,
            );

        expect(dump(result)).toMatchSnapshot();
    });

    it('should preserve insertion order without orderBy', async () => {
        const {run} = await prepareExtension([
            ['**/*.md', './test', ['banana.md', 'apple.md', 'cherry.md'] as NormalizedPath[]],
        ]);

        const result = await getTocHooks(run.toc)
            .Includer.for('generic')
            .promise(
                {path: 'toc.yaml' as NormalizedPath},
                {
                    input: './test',
                    path: './test/toc.yaml',
                    autotitle: false,
                },
                'toc.yaml' as NormalizedPath,
            );

        expect(dump(result)).toMatchSnapshot();
    });

    it('should keep directory name as folder name when linkIndex is enabled by default', async () => {
        const {run} = await prepareExtension([
            [
                '**/*.md',
                './test',
                [
                    'index.md',
                    'test.md',
                    'sub/index.md',
                    'sub/sub-1.md',
                    'sub/sub-2.md',
                    'sub/sub/sub-3.md',
                    'skip/sub/sub-1.md',
                ] as NormalizedPath[],
            ],
        ]);

        const result = await getTocHooks(run.toc)
            .Includer.for('generic')
            .promise(
                {path: 'toc.yaml' as NormalizedPath},
                {
                    input: './test',
                    path: './test/toc.yaml',
                    linkIndex: true,
                },
                'toc.yaml' as NormalizedPath,
            );

        expect(dump(result)).toMatchSnapshot();
    });

    it('should leave directory name empty when linkIndexAutotitle is enabled', async () => {
        const {run} = await prepareExtension([
            [
                '**/*.md',
                './test',
                [
                    'index.md',
                    'test.md',
                    'sub/index.md',
                    'sub/sub-1.md',
                    'sub/sub-2.md',
                    'sub/sub/sub-3.md',
                    'skip/sub/sub-1.md',
                ] as NormalizedPath[],
            ],
        ]);

        const result = await getTocHooks(run.toc)
            .Includer.for('generic')
            .promise(
                {path: 'toc.yaml' as NormalizedPath},
                {
                    input: './test',
                    path: './test/toc.yaml',
                    linkIndex: true,
                    linkIndexAutotitle: true,
                },
                'toc.yaml' as NormalizedPath,
            );

        expect(dump(result)).toMatchSnapshot();
    });

    it('should keep folder name when linkIndexAutotitle is set but autotitle is disabled', async () => {
        const {run} = await prepareExtension([
            [
                '**/*.md',
                './test',
                [
                    'index.md',
                    'test.md',
                    'sub/index.md',
                    'sub/sub-1.md',
                    'sub/sub-2.md',
                    'sub/sub/sub-3.md',
                    'skip/sub/sub-1.md',
                ] as NormalizedPath[],
            ],
        ]);

        const result = await getTocHooks(run.toc)
            .Includer.for('generic')
            .promise(
                {path: 'toc.yaml' as NormalizedPath},
                {
                    input: './test',
                    path: './test/toc.yaml',
                    autotitle: false,
                    linkIndex: true,
                    linkIndexAutotitle: true,
                },
                'toc.yaml' as NormalizedPath,
            );

        expect(dump(result)).toMatchSnapshot();
    });

    it('should use directory name when linkIndex is enabled and autotitle is disabled', async () => {
        const {run} = await prepareExtension([
            [
                '**/*.md',
                './test',
                [
                    'index.md',
                    'test.md',
                    'sub/index.md',
                    'sub/sub-1.md',
                    'sub/sub-2.md',
                    'sub/sub/sub-3.md',
                    'skip/sub/sub-1.md',
                ] as NormalizedPath[],
            ],
        ]);

        const result = await getTocHooks(run.toc)
            .Includer.for('generic')
            .promise(
                {path: 'toc.yaml' as NormalizedPath},
                {
                    input: './test',
                    path: './test/toc.yaml',
                    autotitle: false,
                    linkIndex: true,
                },
                'toc.yaml' as NormalizedPath,
            );

        expect(dump(result)).toMatchSnapshot();
    });
});
