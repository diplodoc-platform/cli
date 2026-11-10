import type {BuildArgs, BuildConfig} from '~/commands/build';

import {describe, expect, it} from 'vitest';

import {Build} from '~/commands/build';
import {getHooks} from '~/core/program';

import {SearchIndex} from './index';

describe('search corpus build mode', () => {
    it('rejects watch builds rather than exposing a stale snapshot', async () => {
        const build = new Build();
        new SearchIndex().apply(build);
        await expect(
            getHooks(build).Config.promise(
                {outputFormat: 'html', watch: true} as BuildConfig,
                {searchIndex: true} as BuildArgs,
            ),
        ).rejects.toThrow('watch');
    });
});
