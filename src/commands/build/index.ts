import type {Meta} from '~/core/meta';
import type {EntryTocItem, Toc, GraphData as TocGraphData} from '~/core/toc';
import type {SyncData as VcsSyncData} from '~/core/vcs';
import type {Graph} from '~/core/utils';
import type {BuildArgs, BuildConfig, EntryInfo} from './types';

import {basename, dirname, join, relative} from 'node:path';
import {isMainThread} from 'node:worker_threads';
import pmap from 'p-map';

import * as threads from '~/commands/threads';
import {Extension as OpenapiIncluderExtension} from '~/extensions/openapi';
import {Extension as GenericIncluderExtension} from '~/extensions/generic-includer';
import {Extension as LocalSearchExtension} from '~/extensions/local-search';
import {bounded, console, normalizePath, own, setExt} from '~/core/utils';
import {Command} from '~/core/config';
import {PAGE_PROCESS_CONCURRENCY, Stage, YFM_CONFIG_FILENAME} from '~/constants';
import {getHooks as getTocHooks} from '~/core/toc';
import {
    BaseProgram,
    getHooks as getBaseHooks,
    withConfigDefaults,
    withConfigScope,
} from '~/core/program';

import {getHooks, withHooks} from './hooks';
import {OutputFormat, normalize, options, validate} from './config';
import {Run} from './run';
import {handler} from './handler';
import {Templating} from './features/templating';
import {CustomResources} from './features/custom-resources';
import {Contributors} from './features/contributors';
import {SinglePage} from './features/singlepage';
import {PdfPage} from './features/pdf-page';
import {Lint} from './features/linter';
import {BuildManifest} from './features/build-manifest';
import {SkipHtml} from './features/skip-html';
import {Changelogs} from './features/changelogs';
import {OutputMd} from './features/output-md';
import {OutputHtml} from './features/output-html';
import {Search} from './features/search';
import {Watch} from './features/watch';
import {Legacy} from './features/legacy';
import {TocFiltering} from './features/toc-filtering';
import {NeuroExpert} from './features/neuro-expert';

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
            removeEmptyTocItems: false,
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

    readonly pdfPage = new PdfPage();

    readonly linter = new Lint();

    readonly buildManifest = new BuildManifest();

    readonly changelogs = new Changelogs();

    readonly md = new OutputMd();

    readonly html = new OutputHtml();

    readonly search = new Search();

    readonly watch = new Watch();

    readonly legacy = new Legacy();

    readonly tocFiltering = new TocFiltering();

    readonly command = new Command('build').description('Build documentation in target directory');

    readonly skipHtml = new SkipHtml();

    readonly neuroExpert = new NeuroExpert();

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
        options.staticContent,
        options.addSystemMeta,
        options.ignore,
        options.ignoreStage,
        options.vcs,
        options.vcsToken,
        options.config(YFM_CONFIG_FILENAME),
        options.interfaceToc,
        options.interfaceSearch,
        options.interfaceFeedback,
        options.pdfDebug,
        options.maxInlineSvgSize,
    ];

    readonly modules = [
        this.templating,
        this.resources,
        this.contributors,
        this.singlepage,
        this.pdfPage,
        this.linter,
        this.buildManifest,
        this.changelogs,
        this.search,
        this.watch,
        this.md,
        this.html,
        this.legacy,
        this.tocFiltering,
        this.skipHtml,
        this.neuroExpert,
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
        getBaseHooks(this).RawConfig.tap('Build', validate);
        getBaseHooks(this).Config.tap({name: 'Build', stage: -1}, normalize);

        super.apply(program);
    }

    async action() {
        const {outputFormat} = this.config;

        this.run = new Run(this.config);

        this.run.logger.pipe(this.logger);

        await getBaseHooks(this).BeforeAnyRun.promise(this.run);
        await getHooks(this).BeforeRun.for(outputFormat).promise(this.run);

        if (isMainThread) {
            console.log('Prepare build input');
            await this.prepareInput();
        }

        console.log('Prepare build runtime');
        await this.prepareRun();

        if (!isMainThread) {
            return;
        }

        await threads.setup();

        console.log('Collect project files info');
        const ignore = this.run.config.ignore.map((rule) => rule.replace(/\/*$/g, '/**'));
        const paths = await this.run.glob('**/toc.yaml', {
            cwd: this.run.input,
            ignore,
        });

        // Regenerate toc entry names from md titles
        getTocHooks(this.run.toc).Loaded.tapPromise('Build', async (toc) => {
            await this.run.toc.walkEntries(
                toc?.items as EntryTocItem[],
                async (item: EntryTocItem) => {
                    if (!item.name || item.name === '{#T}') {
                        const entry = normalizePath(join(dirname(toc.path), item.href));
                        const titles = await this.run.markdown.titles(entry);
                        item.name = titles['#'] || setExt(basename(entry), '');
                    }

                    return item;
                },
            );
        });

        await this.run.toc.init(paths);

        const vcs = this.run.vcs.getData();

        console.log('Sync project data');
        await this.sync(this.run.toc.relations, vcs);

        await this.concurrently(this.run.toc.tocs, this.processToc);

        console.log('Process project files');
        await this.concurrently(this.run.toc.entries, async (entry) => {
            try {
                await this.processEntry(entry);
            } catch (error) {
                if (own<string>(error, 'code') && error.code === 'ENOENT') {
                    const path = normalizePath(relative(this.run.input, error.path));
                    if (path !== entry) {
                        this.run.entry.relations.addNode(entry, {type: 'entry'});
                        this.run.entry.relations.addNode(path, {type: 'missed'});
                    }
                }

                console.error(error);
                this.run.logger.error(`${entry}: ${error}`);
            }
        });

        await handler(this.run);

        console.log('Aggregate build artifacts');
        await this.releaseRun();

        await getHooks(this).AfterRun.for(outputFormat).promise(this.run);
        await getBaseHooks(this).AfterAnyRun.promise(this.run);

        console.log('Cleanup build results');
        await this.cleanup();
    }

    async concurrently<T>(items: T[], iterator: (item: T, index: number) => Promise<void>) {
        await pmap(items, iterator, {
            concurrency: PAGE_PROCESS_CONCURRENCY,
        });
    }

    @threads.multicast('build.sync')
    async sync(tocs: Graph<TocGraphData>, vcs: VcsSyncData) {
        this.run.vcs.setData(vcs);
        this.run.toc.relations.consume(tocs);
    }

    @bounded async processToc(raw: Toc) {
        const toc = await this.run.toc.dump(raw.path, raw);

        await this.run.write(join(this.run.output, toc.path), toc.toString(), true);
    }

    @bounded async processEntry(entry: NormalizedPath) {
        const {outputFormat} = this.config;

        const startTime = Date.now();
        this.run.logger.proc(entry);

        this.run.entry.relations.addNode(entry);

        const meta = this.run.meta.get(entry);

        const info = await this.process(entry, meta);

        this.run.vars.relations.consume(info.varsGraph);
        this.run.entry.relations.consume(info.entryGraph);

        await getHooks(this).Entry.for(outputFormat).promise(this.run, entry, info);

        const time = ((Date.now() - startTime) / 1000).toPrecision(3);
        this.run.logger.info(`${time}: Processing finished:`, entry);
    }

    @threads.threaded('build.process')
    async process(file: NormalizedPath, meta: Meta): Promise<EntryInfo> {
        this.run.meta.set(file, meta);

        const result = await this.run.entry.dump(file);

        await this.run.write(join(this.run.output, result.path), result.toString(), true);

        return {
            ...result.info,
            entryGraph: result.info.entryGraph,
            varsGraph: result.info.varsGraph,
        };
    }

    private async prepareInput() {
        const {originalInput, input} = this.run;
        await this.cleanup();
        await this.run.copy(originalInput, input, ['node_modules/**', '*/node_modules/**']);
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
    }
}
