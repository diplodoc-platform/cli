import { describe, expect, it } from 'vitest';
import {when} from 'vitest-when';
import {join} from 'node:path';

import {setupBuild, setupRun} from '~/commands/build/__tests__';

import {GenericIncluderExtension} from './generic';

describe('Generic includer', () => {
    it('should work', async () => {
        const input = '/dev/null/input' as AbsolutePath;
        const output = '/dev/null/output' as AbsolutePath;
        const build = setupBuild();
        const run = setupRun({input, output});
        const extension = new GenericIncluderExtension();

        when(run.glob).calledWith('**/*.md', {
            cwd: join(run.input, 'test')
        }).thenResolve([
            './index.md',
            './test.md',
            './sub/sub-1.md',
            './sub/sub-2.md',
            './sub/sub/sub-3.md',
            './skip/sub/sub-1.md',
        ] as RelativePath[]);

        extension.apply(build);

        await build.hooks.BeforeAnyRun.promise(run);

        const result = await run.toc.hooks.Includer.for('generic').promise({}, {
            input: 'test' as RelativePath,
            path: 'test/toc.yaml' as RelativePath,
        }, './toc.yaml' as RelativePath);

        console.log(JSON.stringify(result, null, 2));
    });
});
