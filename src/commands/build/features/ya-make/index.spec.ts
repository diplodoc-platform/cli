import type {BuildConfig} from '../..';
import type {FullTap} from 'tapable';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {join} from 'node:path';
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import chokidar from 'chokidar';

import {getHooks as getBaseHooks} from '~/core/program';

import {Build} from '../..';

import {YaMake} from './index';

vi.mock('chokidar', () => ({
    default: {watch: vi.fn()},
}));

const tapByName = (taps: FullTap[], name: string) => {
    const tap = taps.find((t) => t.name === name);
    if (!tap) {
        throw new Error(`tap ${name} not registered`);
    }
    return tap.fn;
};

const setup = () => {
    const build = new Build();
    new YaMake().apply(build);
    return {
        configTap: tapByName(getBaseHooks(build).Config.taps, 'YaMake'),
        afterRunTap: tapByName(getBaseHooks(build).AfterAnyRun.taps, 'YaMake'),
        commandTap: tapByName(getBaseHooks(build).Command.taps, 'YaMake'),
    };
};

describe('YaMake', () => {
    let tmp: string;

    beforeEach(() => {
        tmp = join(tmpdir(), `ya-make-index-${Date.now()}`);
        mkdirSync(tmp, {recursive: true});
        vi.clearAllMocks();
    });

    afterEach(() => {
        rmSync(tmp, {recursive: true, force: true});
    });

    describe('Command hook', () => {
        it('registers --arcadia-root option', () => {
            const {commandTap} = setup();
            const seen: unknown[] = [];
            commandTap({addOption: (o: unknown) => seen.push(o)});
            expect(seen).toHaveLength(1);
        });
    });

    describe('Config hook', () => {
        it('returns config unchanged when --arcadia-root is not set and ya.make is absent', async () => {
            const {configTap} = setup();
            const config = {input: tmp, output: join(tmp, 'out')} as BuildConfig;
            // No arcadiaRoot in args; even if ya is detected, ya.make doesn't exist in tmp
            const result = await configTap(config, {});
            expect(result.input).toBe(tmp);
            expect(result.yaMake).toBeUndefined();
        });

        it('returns config unchanged when ya.make does not exist', async () => {
            const {configTap} = setup();
            const config = {input: tmp, output: join(tmp, 'out')} as BuildConfig;
            const result = await configTap(config, {arcadiaRoot: '/arcadia'});
            expect(result.input).toBe(tmp);
            expect(result.yaMake).toBeUndefined();
        });

        it('assembles and redirects config.input when ya.make exists', async () => {
            writeFileSync(join(tmp, 'ya.make'), 'DOCS(html)\nEND()');
            const {configTap} = setup();
            const out = join(tmp, 'out');
            const config = {input: tmp, output: out} as BuildConfig;
            const result = await configTap(config, {arcadiaRoot: tmp});
            expect(result.yaMake?.root).toBe(tmp);
            expect(result.input).toBe(join(out, '.ya-make-input'));
            expect(existsSync(join(out, '.ya-make-input'))).toBe(true);
        });
    });

    describe('AfterAnyRun hook', () => {
        it('returns early when watch is disabled', async () => {
            const {afterRunTap} = setup();
            await afterRunTap({config: {watch: false}});
            expect(vi.mocked(chokidar.watch)).not.toHaveBeenCalled();
        });

        it('returns early when yaMake config is absent', async () => {
            const {afterRunTap} = setup();
            await afterRunTap({config: {watch: true, yaMake: undefined}});
            expect(vi.mocked(chokidar.watch)).not.toHaveBeenCalled();
        });

        it('returns early when no watchable paths exist on disk', async () => {
            const {afterRunTap} = setup();
            const parsed = {
                arcadiaRoot: tmp,
                docsDir: undefined,
                copyFiles: [{from: join(tmp, 'nonexistent'), namespace: 'ru', files: ['a.md']}],
                includeSources: [],
                peerDirs: [],
                copyFileSingle: [],
            };
            await afterRunTap({config: {watch: true, yaMake: {parsed, assembledDir: tmp}}});
            expect(vi.mocked(chokidar.watch)).not.toHaveBeenCalled();
        });

        it('starts watcher for existing docsDir', async () => {
            const mockOn = vi.fn().mockReturnThis();
            vi.mocked(chokidar.watch).mockReturnValue({on: mockOn} as any);

            const docsDir = join(tmp, 'common');
            mkdirSync(docsDir);

            const {afterRunTap} = setup();
            const parsed = {
                arcadiaRoot: tmp,
                docsDir,
                copyFiles: [],
                includeSources: [],
                peerDirs: [],
                copyFileSingle: [],
            };
            await afterRunTap({config: {watch: true, yaMake: {parsed, assembledDir: tmp}}});

            expect(vi.mocked(chokidar.watch)).toHaveBeenCalledWith([docsDir], {
                ignoreInitial: true,
            });
            expect(mockOn).toHaveBeenCalledWith('all', expect.any(Function));
        });

        describe('file event handler', () => {
            const getHandler = async (docsDir: string, assembledDir: string) => {
                const mockOn = vi.fn().mockReturnThis();
                vi.mocked(chokidar.watch).mockReturnValue({on: mockOn} as any);

                const {afterRunTap} = setup();
                const parsed = {
                    arcadiaRoot: tmp,
                    docsDir,
                    copyFiles: [],
                    includeSources: [],
                    peerDirs: [],
                    copyFileSingle: [],
                };
                await afterRunTap({config: {watch: true, yaMake: {parsed, assembledDir}}});
                return mockOn.mock.calls[0][1] as (type: string, path: string) => void;
            };

            it('copies file on change event', async () => {
                const docsDir = join(tmp, 'common');
                const assembledDir = join(tmp, 'assembled');
                mkdirSync(join(docsDir, 'ru'), {recursive: true});
                mkdirSync(assembledDir);
                writeFileSync(join(docsDir, 'ru/index.md'), 'hello');

                const handler = await getHandler(docsDir, assembledDir);
                handler('change', join(docsDir, 'ru/index.md'));

                expect(existsSync(join(assembledDir, 'ru/index.md'))).toBe(true);
            });

            it('copies file on add event', async () => {
                const docsDir = join(tmp, 'common');
                const assembledDir = join(tmp, 'assembled');
                mkdirSync(join(docsDir, 'ru'), {recursive: true});
                mkdirSync(assembledDir);
                writeFileSync(join(docsDir, 'ru/new.md'), 'new');

                const handler = await getHandler(docsDir, assembledDir);
                handler('add', join(docsDir, 'ru/new.md'));

                expect(existsSync(join(assembledDir, 'ru/new.md'))).toBe(true);
            });

            it('removes file on unlink event', async () => {
                const docsDir = join(tmp, 'common');
                const assembledDir = join(tmp, 'assembled');
                mkdirSync(join(docsDir, 'ru'), {recursive: true});
                mkdirSync(join(assembledDir, 'ru'), {recursive: true});
                writeFileSync(join(assembledDir, 'ru/old.md'), 'old');

                const handler = await getHandler(docsDir, assembledDir);
                handler('unlink', join(docsDir, 'ru/old.md'));

                expect(existsSync(join(assembledDir, 'ru/old.md'))).toBe(false);
            });

            it('skips unresolvable paths silently', async () => {
                const docsDir = join(tmp, 'common');
                mkdirSync(docsDir);

                const handler = await getHandler(docsDir, join(tmp, 'assembled'));
                expect(() => handler('change', '/unrelated/path.md')).not.toThrow();
            });
        });
    });
});
