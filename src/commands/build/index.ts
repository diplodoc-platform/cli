import type {BuildArgs, BuildConfig, EntryInfo} from './types';

import {ok} from 'node:assert';
import pmap from 'p-map';

import {
    BaseProgram,
    getHooks as getBaseHooks,
    withConfigDefaults,
    withConfigScope,
} from '~/core/program';
import {Lang, PAGE_PROCESS_CONCURRENCY, Stage, YFM_CONFIG_FILENAME} from '~/constants';
import {Command, defined, valuable} from '~/core/config';
import {bounded, langFromPath} from '~/core/utils';
import {Extension as GenericIncluderExtension} from '~/extensions/generic-includer';
import {Extension as OpenapiIncluderExtension} from '~/extensions/openapi';
import {Extension as LocalSearchExtension} from '~/extensions/search';
import {Extension as AlgoliaSearchExtension} from '~/extensions/algolia';

import {getHooks, withHooks} from './hooks';
import {OutputFormat, options} from './config';
import {Run} from './run';
import {handler} from './handler';

import {Templating} from './features/templating';
import {CustomResources} from './features/custom-resources';
import {Contributors} from './features/contributors';
import {SinglePage} from './features/singlepage';
import {Redirects} from './features/redirects';
import {Lint} from './features/linter';
import {Changelogs} from './features/changelogs';
import {OutputMd} from './features/output-md';
import {OutputHtml} from './features/output-html';
import {Search} from './features/search';
import {Legacy} from './features/legacy';
import {processEntry} from './entry';

export type * from './types';
export type {SearchProvider, SearchServiceConfig} from './services/search';

export {Run, getHooks};

export {getHooks as getSearchHooks} from './services/search';

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
            mergeIncludes: false,
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

    readonly redirects = new Redirects();

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
        options.mergeIncludes,
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
        this.redirects,
        this.linter,
        this.changelogs,
        this.search,
        this.md,
        this.html,
        this.legacy,
        new GenericIncluderExtension(),
        new OpenapiIncluderExtension(),
        new LocalSearchExtension(),
        new AlgoliaSearchExtension(),
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

        await this.prepareInput();
        await this.prepareRun();

        const ignore = this.run.config.ignore.map((rule) => rule.replace(/\/*$/g, '/**'));
        const tocs = await this.run.glob('**/toc.yaml', {
            cwd: this.run.input,
            ignore,
        });

        for (const toc of tocs) {
            await this.run.toc.load(toc);
        }

        await pmap(
            this.run.toc.entries,
            async (entry, position) => {
                try {
                    this.run.logger.proc(entry);

                    // Add generator meta tag with versions
                    this.run.meta.add(entry, {
                        metadata: {
                            generator: `Diplodoc Platform v${VERSION}`,
                        },
                    });

                    const info = await this.process(entry);
                    const tocDir = this.run.toc.dir(entry);

                    await getHooks(this)
                        .Entry.for(outputFormat)
                        .promise(entry, {...info, position}, tocDir);

                    if (outputFormat === 'html') {
                        const lang = langFromPath(entry, this.run.config);
                        await this.run.search.add(entry, lang, info);
                    }

                    this.run.logger.info('Processing finished:', entry);
                } catch (error) {
                    console.error(error);
                    this.run.logger.error(error);
                }
            },
            {
                concurrency: PAGE_PROCESS_CONCURRENCY,
            },
        );

        await handler(this.run);

        await this.releaseRun();

        await getHooks(this).AfterRun.for(outputFormat).promise(this.run);
        await getBaseHooks(this).AfterAnyRun.promise(this.run);

        await this.releaseOutput();
    }

    @bounded
    async process(entry: NormalizedPath): Promise<EntryInfo> {
        return processEntry(this.run, entry);
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
    }

    private async releaseRun() {
        await this.run.search.release();
    }

    private async cleanup() {
        await this.run.remove(this.run.input);
        await this.run.remove(this.run.output);
    }
}
