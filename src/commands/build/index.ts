import type {IBaseProgram, IProgram} from '~/core/program';
import type {BuildArgs, BuildConfig} from './types';

import {ok} from 'node:assert';
import {join} from 'node:path';
import {dump} from 'js-yaml';

import {
    BaseProgram,
    getHooks as getBaseHooks,
    withConfigDefaults,
    withConfigScope,
} from '~/core/program';
import {Lang, Stage, YFM_CONFIG_FILENAME} from '~/constants';
import {Command, configPath, defined, valuable} from '~/core/config';
import {getHooks as getTocHooks} from '~/core/toc';
import {Extension as GenericIncluderExtension} from '~/extensions/generic-includer';
import {Extension as OpenapiIncluderExtension} from '~/extensions/openapi';
import {Extension as LocalSearchExtension} from '~/extensions/search';
import {Extension as AlgoliaSearchExtension} from '~/extensions/algolia';

import {getHooks, withHooks} from './hooks';
import {OutputFormat, options} from './config';
import {Run} from './run';
import {handler} from './handler';

import {Templating} from './features/templating';
import {Contributors} from './features/contributors';
import {SinglePage} from './features/singlepage';
import {Redirects} from './features/redirects';
import {Lint} from './features/linter';
import {Changelogs} from './features/changelogs';
import {Html} from './features/html';
import {Search} from './features/search';
import {Legacy} from './features/legacy';

export * from './types';

export {getHooks};

export type {Run};

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
            resources: {},
            allowCustomResources: false,
            staticContent: false,
            ignoreStage: [Stage.SKIP],
            addSystemMeta: false,
            lint: {enabled: true, config: {'log-levels': {}}},
        }) as Partial<BuildConfig>,
)
export class Build extends BaseProgram<BuildConfig, BuildArgs> implements IProgram<BuildArgs> {
    readonly name = command;

    readonly templating = new Templating();

    readonly contributors = new Contributors();

    readonly singlepage = new SinglePage();

    readonly redirects = new Redirects();

    readonly linter = new Lint();

    readonly changelogs = new Changelogs();

    readonly html = new Html();

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
        options.resources,
        options.allowCustomResources,
        options.staticContent,
        options.addSystemMeta,
        options.ignore,
        options.ignoreStage,
        options.config(YFM_CONFIG_FILENAME),
    ];

    readonly modules = [
        this.templating,
        this.contributors,
        this.singlepage,
        this.redirects,
        this.linter,
        this.changelogs,
        this.search,
        this.html,
        this.legacy,
        new GenericIncluderExtension(),
        new OpenapiIncluderExtension(),
        new LocalSearchExtension(),
        new AlgoliaSearchExtension(),
    ];

    apply(program?: IBaseProgram) {
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

            // Temporary disable fixed strict behavior.
            // We need to announce this fix.
            config.strict = false;

            return config;
        });

        getHooks(this)
            .BeforeRun.for('md')
            .tap('Build', (run) => {
                getTocHooks(run.toc).Resolved.tapPromise('Build', async (_toc, path) => {
                    await run.write(join(run.output, path), dump(await run.toc.dump(path)));
                });
            });

        getHooks(this)
            .AfterRun.for('md')
            .tapPromise('Build', async (run) => {
                // TODO: save normalized config instead
                if (run.config[configPath]) {
                    await run.copy(run.config[configPath], join(run.output, '.yfm'));
                }
            });

        super.apply(program);
    }

    async action() {
        const run = new Run(this.config);

        run.logger.pipe(this.logger);

        await cleanup(run);

        await getBaseHooks(this).BeforeAnyRun.promise(run);
        await getHooks(this).BeforeRun.for(this.config.outputFormat).promise(run);

        await run.copy(run.originalInput, run.input, ['node_modules/**', '*/node_modules/**']);

        await run.vars.init();
        await run.toc.init();
        await run.search.init();

        await Promise.all([handler(run), getHooks(this).Run.promise(run)]);

        await run.search.release();

        await getHooks(this).AfterRun.for(this.config.outputFormat).promise(run);
        await getBaseHooks(this).AfterAnyRun.promise(run);

        await run.copy(run.output, run.originalOutput);

        await cleanup(run);
    }
}

async function cleanup(run: Run) {
    await run.remove(run.input);
    await run.remove(run.output);
}
