import type {BuildArgs, BuildConfig, EntryInfo} from '~/commands/build';

import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';

import {Build, getHooks as getBuildHooks} from '~/commands/build';
import {getHooks} from '~/core/program';

import {setupRun} from '../../__tests__';
import {OutputHtml} from '../output-html';

import {SearchIndex} from './index';

async function exportBuild(enabled: boolean) {
    const build = new Build();
    new SearchIndex().apply(build);
    new OutputHtml().apply(build);
    const config = {
        outputFormat: 'html',
        watch: false,
        lang: 'en',
        langs: ['en', 'ru'],
        skipHtmlExtension: false,
    } as BuildConfig;
    await getHooks(build).Config.promise(config, {searchIndex: enabled} as BuildArgs);
    const run = setupRun(config);
    const source = join(run.input, '_search/documents.json');
    const output = join(run.output, '_search/documents.json');
    const files = new Map<string, string>([
        [source, 'source snapshot'],
        [output, 'previous snapshot'],
    ]);
    vi.mocked(run.exists).mockImplementation((path) => files.has(path));
    vi.mocked(run.remove).mockImplementation(async (path) => {
        files.delete(path);
    });
    vi.mocked(run.write).mockImplementation(async (path, content) => {
        files.set(path, content);
    });
    vi.mocked(run.copy).mockImplementation(async (from, to): Promise<[string, string][]> => {
        if (from === run.input && to === run.output) {
            files.set(output, files.get(source) || '');
            return [[source, output]];
        }
        return [];
    });
    await getBuildHooks(build).BeforeRun.for('html').promise(run);
    return {build, run, files, output, source};
}

describe('search corpus build mode', () => {
    it('publishes a sorted snapshot after the real HTML asset-copy hook', async () => {
        const {build, run, files, output} = await exportBuild(true);
        expect(files.has(output)).toBe(false);
        const entries = getBuildHooks(build).Entry.for('html');
        await entries.promise(
            run,
            'ru/guide.md' as NormalizedPath,
            {title: 'Russian', html: '<p>Content</p>', meta: {}} as EntryInfo,
        );
        await entries.promise(
            run,
            'en/guide.md' as NormalizedPath,
            {title: 'English', html: '<p>Content</p>', meta: {}} as EntryInfo,
        );
        await getBuildHooks(build).AfterRun.for('html').promise(run);
        const snapshot = JSON.parse(files.get(output) || '{}');
        expect(snapshot.schemaVersion).toBe(1);
        expect(
            snapshot.documents.map(({path, title}: {path: string; title: string}) => ({
                path,
                title,
            })),
        ).toEqual([
            {path: 'en/guide.md', title: 'English'},
            {path: 'ru/guide.md', title: 'Russian'},
        ]);
    });

    it.each([
        {enabled: false, errors: false},
        {enabled: true, errors: true},
    ])('removes copied snapshots when export is unavailable: %j', async ({enabled, errors}) => {
        const {build, run, files, output, source} = await exportBuild(enabled);
        if (errors) {
            vi.mocked(run.logger.error).mockRestore();
            run.logger.error('Fixture build error');
        }
        await getBuildHooks(build).AfterRun.for('html').promise(run);
        expect(files.has(output)).toBe(false);
        expect(files.get(source)).toBe('source snapshot');
    });

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
