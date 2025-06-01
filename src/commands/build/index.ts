import type {Meta} from '~/core/meta';
import type {EntryTocItem, Toc} from '~/core/toc';
import type {BuildArgs, BuildConfig, EntryInfo} from './types';

import {ok} from 'node:assert';
import {basename, dirname, join} from 'node:path';
import {isMainThread} from 'node:worker_threads';
import pmap from 'p-map';

import {
    BaseProgram,
    getHooks as getBaseHooks,
    withConfigDefaults,
    withConfigScope,
} from '~/core/program';
import {getHooks as getTocHooks} from '~/core/toc';
import {Lang, PAGE_PROCESS_CONCURRENCY, Stage, YFM_CONFIG_FILENAME} from '~/constants';
import {Command, defined, valuable} from '~/core/config';
import {normalizePath, setExt} from '~/core/utils';
import {Extension as GithubVcsConnector} from '~/extensions/github-vcs-connector';
import {Extension as GenericIncluderExtension} from '~/extensions/generic-includer';
import {Extension as OpenapiIncluderExtension} from '~/extensions/openapi';
import {Extension as LocalSearchExtension} from '~/extensions/search';
import * as threads from '~/commands/threads';

import {getHooks, withHooks} from './hooks';
import {OutputFormat, options} from './config';
import {Run} from './run';
import {handler} from './handler';

import {Templating} from './features/templating';
import {CustomResources} from './features/custom-resources';
import {Contributors} from './features/contributors';
import {SinglePage} from './features/singlepage';
import {Lint} from './features/linter';
import {Changelogs} from './features/changelogs';
import {OutputMd} from './features/output-md';
import {OutputHtml} from './features/output-html';
import {Search} from './features/search';
import {Legacy} from './features/legacy';

export type * from './types';

export {Run, getHooks};

export {getHooks as getEntryHooks} from './services/entry';
export {getHooks as getSearchHooks} from './services/search';
export {getHooks as getRedirectsHooks} from './services/redirects';

const command = 'Build';

@withHooks
@withConfigScope('build')
@withConfigDefaults(
    () =>
        ({
            langs: [],
            outputFormat: OutputFormat.html,
            varsPreset: 'default',
            vars: {},
            ignore: [],
            allowHtml: true,
            sanitizeHtml: true,
            addMapFile: false,
            removeHiddenTocItems: false,
            staticContent: false,
            ignoreStage: [Stage.SKIP],
            addSystemMeta: false,
            lint: {enabled: true, config: {}},
        }) as Partial<BuildConfig>,
)
export class Build extends BaseProgram<BuildConfig, BuildArgs> {
    readonly name = command;

    readonly templating = new Templating();

    readonly resources = new CustomResources();

    readonly contributors = new Contributors();

    readonly singlepage = new SinglePage();

    readonly linter = new Lint();

    readonly changelogs = new Changelogs();

    readonly md = new OutputMd();

    readonly html = new OutputHtml();

    readonly search = new Search();

    readonly legacy = new Legacy();

    readonly command = new Command('build').description('Build documentation in target directory');

    readonly options = [
        options.input('./'),
        options.output({required: true}),
        options.langs,
        options.outputFormat,
        options.varsPreset,
        options.vars,
        options.allowHtml,
        options.sanitizeHtml,
        options.addMapFile,
        options.removeHiddenTocItems,
        options.staticContent,
        options.addSystemMeta,
        options.ignore,
        options.ignoreStage,
        options.config(YFM_CONFIG_FILENAME),
    ];

    readonly modules = [
        this.templating,
        this.resources,
        this.contributors,
        this.singlepage,
        this.linter,
        this.changelogs,
        this.search,
        this.md,
        this.html,
        this.legacy,
        new GithubVcsConnector(),
        new GenericIncluderExtension(),
        new OpenapiIncluderExtension(),
        new LocalSearchExtension(),
    ];

    /**
     * IMPORTANT:
     * Run should always be private.
     * This is a main principe of build process isolation.
     * Any access to run should be defined with help of hooks.
     */
    private run!: Run;

    apply(program?: BaseProgram) {
        getBaseHooks(this).Config.tap('Build', (config, args) => {
            const ignoreStage = defined('ignoreStage', args, config) || [];
            const langs = defined('langs', args, config) || [];
            const lang = defined('lang', config);

            if (valuable(lang)) {
                if (!langs.length) {
                    langs.push(lang);
                }

                ok(
                    langs.includes(lang),
                    `Configured default lang '${lang}' is not listed in langs (${langs.join(', ')})`,
                );
            }

            if (!langs.length) {
                langs.push(Lang.RU);
            }

            config.ignoreStage = [].concat(ignoreStage);
            config.langs = langs;
            config.lang = lang || langs[0];

            return config;
        });

        super.apply(program);
    }

    async action() {
        const {outputFormat} = this.config;

        this.run = new Run(this.config);

        this.run.logger.pipe(this.logger);

        await getBaseHooks(this).BeforeAnyRun.promise(this.run);
        await getHooks(this).BeforeRun.for(outputFormat).promise(this.run);

        if (isMainThread) {
            await this.prepareInput();
        }

        await this.prepareRun();

        if (!isMainThread) {
            return;
        }

        await threads.setup();

        const ignore = this.run.config.ignore.map((rule) => rule.replace(/\/*$/g, '/**'));
        const paths = await this.run.glob('**/toc.yaml', {
            cwd: this.run.input,
            ignore,
        });

        // Regenerate toc entry names from md titles
        getTocHooks(this.run.toc).Loaded.tapPromise('Build', async (toc, path) => {
            await this.run.toc.walkEntries(
                toc?.items as EntryTocItem[],
                async (item: EntryTocItem) => {
                    if (!item.name || item.name === '{#T}') {
                        const entry = normalizePath(join(dirname(path), item.href));
                        const titles = await this.run.markdown.titles(entry);
                        item.name = titles['#'] || setExt(basename(entry), '');
                    }

                    return item;
                },
            );
        });

        await this.run.toc.init(paths);

        const {tocs, entries} = this.run.toc;

        await this.sync(tocs, entries);

        await this.concurrently(tocs, async (raw) => {
            const toc = await this.run.toc.dump(raw.path, raw);

            await this.run.write(join(this.run.output, toc.path), toc.toString());
        });

        await this.concurrently(entries, async (entry, position) => {
            try {
                this.run.logger.proc(entry);

                const meta = this.run.meta.get(entry);
                const info = await this.process(entry, meta);

                await getHooks(this)
                    .Entry.for(outputFormat)
                    .promise(this.run, entry, {...info, position});

                this.run.logger.info('Processing finished:', entry);
            } catch (error) {
                console.error(error);
                this.run.logger.error(`${entry}: ${error}`);
            }
        });

        await handler(this.run);

        await this.releaseRun();

        await getHooks(this).AfterRun.for(outputFormat).promise(this.run);
        await getBaseHooks(this).AfterAnyRun.promise(this.run);

        await this.releaseOutput();
    }

    async concurrently<T>(items: T[], iterator: (item: T, index: number) => Promise<void>) {
        await pmap(items, iterator, {
            concurrency: PAGE_PROCESS_CONCURRENCY,
        });
    }

    @threads.multicast('build.sync')
    async sync(tocs: Toc[], entries: NormalizedPath[]) {
        this.run.toc.setEntries(entries);
        for (const toc of tocs) {
            this.run.toc.setToc(toc);
        }
    }

    @threads.threaded('build.process')
    async process(file: NormalizedPath, meta: Meta): Promise<EntryInfo> {
        this.run.meta.set(file, meta);

        const result = await this.run.entry.dump(file);

        await this.run.write(join(this.run.output, result.path), result.toString());

        return result.info;
    }

    private async prepareInput() {
        const {originalInput, input} = this.run;
        await this.cleanup();
        await this.run.copy(originalInput, input, ['node_modules/**', '*/node_modules/**']);
    }

    private async releaseOutput() {
        const {output, originalOutput} = this.run;
        await this.run.copy(output, originalOutput);
        await this.cleanup();
    }

    private async prepareRun() {
        await this.run.vars.init();
        await this.run.leading.init();
        await this.run.markdown.init();
        await this.run.vcs.init();
        await this.run.search.init();
        await this.run.redirects.init();
    }

    private async releaseRun() {
        await this.run.search.release();
        await this.run.redirects.release();
    }

    private async cleanup() {
        await this.run.remove(this.run.input);
        await this.run.remove(this.run.output);
    }
}
