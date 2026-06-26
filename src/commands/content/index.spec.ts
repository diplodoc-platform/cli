import type {BuildConfig} from '~/commands/build';

import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {setupRun} from '~/commands/build/__tests__';
import {Run} from '~/commands/build';
import {OutputFormat} from '~/commands/build/config';
import {MarkdownCollector} from '~/commands/build/features/output-md/collect';
import {configPath} from '~/core/config';
import {getHooks as getBaseHooks} from '~/core/program';
import {VarsService} from '~/core/vars';
import {MarkdownService} from '~/core/markdown';

// ContentWatcher is mocked so watch rebuilds can be driven via the recorded
// `onChange` argument (read from the mock's call list).
vi.mock('./features/watch', () => ({
    ContentWatcher: vi.fn(() => ({add: vi.fn(), close: vi.fn()})),
}));

import {ContentWatcher} from './features/watch';

import {CONTENT_END, CONTENT_START, Content} from './index';

const MOCK = resolve(__dirname, '../../../tests/mocks/content');
const INDEX = join(MOCK, 'index.md') as AbsolutePath;
const CONFIG = join(MOCK, '.yfm') as AbsolutePath;

const flush = () => new Promise((r) => setImmediate(r));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const priv = (content: Content) => content as any;

describe('Content command', () => {
    beforeEach(() => {
        (ContentWatcher as unknown as ReturnType<typeof vi.fn>).mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('apply', () => {
        it('registers RawConfig and Config hooks', () => {
            const content = new Content();
            content.apply();

            const hooks = getBaseHooks(content as never);
            const config = hooks.Config.taps.filter((t) => t.name === 'Content');
            const raw = hooks.RawConfig.taps.filter((t) => t.name === 'Content');

            expect(config).toHaveLength(2);
            expect(raw).toHaveLength(1);
        });

        it('Config resolution tap delegates to resolveContentConfig', () => {
            const content = new Content();
            content.apply();

            const tap = getBaseHooks(content as never).Config.taps.find(
                (t) => t.name === 'Content' && t.stage !== -1,
            );

            const config = {input: INDEX, output: undefined, [configPath]: CONFIG};
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = (tap as any).fn(config, {});

            expect(result.file).toEqual('index.md');
            expect(result.input).toEqual(MOCK);
        });
    });

    describe('action', () => {
        it('prepares the run and emits once when watch is off', async () => {
            const content = new Content();
            const prepareRun = vi.spyOn(priv(content), 'prepareRun').mockResolvedValue(undefined);
            const emit = vi.spyOn(priv(content), 'emit').mockResolvedValue(undefined);
            const startWatch = vi.spyOn(priv(content), 'startWatch').mockResolvedValue(undefined);
            priv(content).config = {watch: false};

            await content.action();

            expect(prepareRun).toHaveBeenCalledTimes(1);
            expect(emit).toHaveBeenCalledTimes(1);
            expect(startWatch).not.toHaveBeenCalled();
        });

        it('starts watching when watch is on', async () => {
            const content = new Content();
            vi.spyOn(priv(content), 'prepareRun').mockResolvedValue(undefined);
            vi.spyOn(priv(content), 'emit').mockResolvedValue(undefined);
            const startWatch = vi.spyOn(priv(content), 'startWatch').mockResolvedValue(undefined);
            priv(content).config = {watch: true};

            await content.action();

            expect(startWatch).toHaveBeenCalledTimes(1);
        });
    });

    describe('render', () => {
        it('renders an html content fragment via run.transform', async () => {
            const content = new Content();
            const run = setupRun({} as BuildConfig);
            priv(content).run = run;
            priv(content).config = {file: 'index.md', outputFormat: OutputFormat.html};

            vi.spyOn(run.markdown, 'load').mockResolvedValue('md');
            vi.spyOn(run.markdown, 'deps').mockResolvedValue([]);
            vi.spyOn(run.markdown, 'assets').mockResolvedValue([]);
            vi.spyOn(run, 'transform').mockResolvedValue(['<p>HTML</p>', {}] as never);

            const result = await priv(content).render();

            expect(result).toEqual('<p>HTML</p>');
        });

        it('renders self-contained markdown via MarkdownCollector + frontmatter', async () => {
            const content = new Content();
            const run = setupRun({} as BuildConfig);
            priv(content).run = run;
            priv(content).config = {file: 'index.md', outputFormat: OutputFormat.md};

            vi.spyOn(MarkdownCollector.prototype, 'collect').mockResolvedValue('# MD body');
            vi.spyOn(run.meta, 'dump').mockResolvedValue({} as never);

            const result = await priv(content).render();

            expect(result).toContain('# MD body');
        });
    });

    describe('emit', () => {
        it('writes content to stdout wrapped in delimiters', async () => {
            const content = new Content();
            priv(content).config = {};
            vi.spyOn(priv(content), 'render').mockResolvedValue('BODY');
            const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

            await priv(content).emit();

            expect(write).toHaveBeenCalledWith(`${CONTENT_START}\nBODY\n${CONTENT_END}\n`);
        });

        it('writes raw content (no delimiters) to the -o file', async () => {
            const dir = mkdtempSync(join(tmpdir(), 'yfm-content-'));
            const outputFile = join(dir, 'nested', 'page.html');

            const content = new Content();
            priv(content).config = {outputFile};
            vi.spyOn(priv(content), 'render').mockResolvedValue('BODY');

            await priv(content).emit();

            expect(readFileSync(outputFile, 'utf8')).toEqual('BODY');

            rmSync(dir, {recursive: true, force: true});
        });
    });

    describe('prepareRun', () => {
        it('builds the run and initializes vars/markdown', async () => {
            vi.spyOn(VarsService.prototype, 'init').mockResolvedValue([]);
            vi.spyOn(MarkdownService.prototype, 'init').mockResolvedValue(undefined);

            const content = new Content();
            priv(content).config = {input: '/dev/null/input', output: '/dev/null/output'};

            await priv(content).prepareRun();

            expect(priv(content).run).toBeInstanceOf(Run);
            expect(VarsService.prototype.init).toHaveBeenCalled();
            expect(MarkdownService.prototype.init).toHaveBeenCalled();
        });
    });

    describe('watchPaths / presetPaths', () => {
        it('collects the file, its includes and existing presets', async () => {
            const content = new Content();
            // Point at the real fixture root so presets.yaml exists on disk.
            const run = setupRun({
                input: MOCK,
                output: MOCK,
                originAsInput: true,
            } as unknown as BuildConfig);
            priv(content).run = run;
            priv(content).config = {file: 'index.md'};

            vi.spyOn(run.markdown, 'deps').mockResolvedValue([
                {path: '_includes/snippet.md'},
            ] as never);

            const paths = await priv(content).watchPaths();

            expect(paths).toContain(join(run.input, 'index.md'));
            expect(paths).toContain(join(run.input, '_includes/snippet.md'));
            expect(paths).toContain(join(run.input, 'presets.yaml'));
        });

        it('survives unresolvable dependencies', async () => {
            const content = new Content();
            const run = setupRun({} as BuildConfig);
            priv(content).run = run;
            priv(content).config = {file: 'index.md'};

            vi.spyOn(run.markdown, 'deps').mockRejectedValue(new Error('boom'));

            const paths = await priv(content).watchPaths();

            expect(paths).toContain(join(run.input, 'index.md'));
        });

        it('lists presets.yaml from the root down to the file directory', () => {
            const content = new Content();
            priv(content).run = {input: '/root'};
            priv(content).config = {file: 'a/b/page.md'};

            const paths = priv(content).presetPaths();

            expect(paths).toEqual([
                join('/root', 'presets.yaml'),
                join('/root/a', 'presets.yaml'),
                join('/root/a/b', 'presets.yaml'),
            ]);
        });
    });

    describe('startWatch', () => {
        it('creates a watcher and rebuilds on change', async () => {
            const content = new Content();
            const prepareRun = vi.spyOn(priv(content), 'prepareRun').mockResolvedValue(undefined);
            const emit = vi.spyOn(priv(content), 'emit').mockResolvedValue(undefined);
            vi.spyOn(priv(content), 'watchPaths').mockResolvedValue([]);
            priv(content).run = {logger: {error: vi.fn()}};

            // Do not await: startWatch blocks forever by design.
            // startWatch blocks forever by design; swallow the dangling promise.
            priv(content)
                .startWatch()
                .catch(() => {});
            await flush();

            const watcherMock = ContentWatcher as unknown as ReturnType<typeof vi.fn>;
            expect(watcherMock).toHaveBeenCalledTimes(1);

            const onChange = watcherMock.mock.calls[0][1] as () => void;
            expect(onChange).toBeTypeOf('function');

            onChange();
            await flush();

            expect(prepareRun).toHaveBeenCalled();
            expect(emit).toHaveBeenCalled();
            expect(watcherMock.mock.results[0].value.add).toHaveBeenCalled();
        });

        it('logs rebuild errors without crashing', async () => {
            const content = new Content();
            vi.spyOn(priv(content), 'prepareRun').mockResolvedValue(undefined);
            vi.spyOn(priv(content), 'emit').mockRejectedValue(new Error('boom'));
            vi.spyOn(priv(content), 'watchPaths').mockResolvedValue([]);
            const error = vi.fn();
            priv(content).run = {logger: {error}};

            priv(content)
                .startWatch()
                .catch(() => {});
            await flush();

            const watcherMock = ContentWatcher as unknown as ReturnType<typeof vi.fn>;
            const onChange = watcherMock.mock.calls[0][1] as () => void;
            onChange();
            await flush();

            expect(error).toHaveBeenCalled();
        });
    });
});
