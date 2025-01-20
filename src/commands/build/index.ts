import type {IProgram, BaseArgs as ProgramArgs, BaseConfig as ProgramConfig} from '~/core/program';
import type {DocAnalytics} from '@diplodoc/client';

import {ok} from 'node:assert';
import {join} from 'node:path';

import {BaseProgram, getHooks as getBaseHooks} from '~/core/program';
import {Lang, Stage, YFM_CONFIG_FILENAME} from '~/constants';
import {
    GenericIncluderExtension,
    OpenapiIncluderExtension,
    getHooks as getTocHooks,
} from '~/core/toc';
import {Command, configPath, defined, valuable} from '~/core/config';

import {Hooks, getHooks, hooks} from './hooks';
import {OutputFormat, options} from './config';
import {Run} from './run';
import {handler} from './handler';

import {
    Templating,
    TemplatingArgs,
    TemplatingConfig,
    TemplatingRawConfig,
} from './features/templating';
import {Contributors, ContributorsArgs, ContributorsConfig} from './features/contributors';
import {SinglePage, SinglePageArgs, SinglePageConfig} from './features/singlepage';
import {Redirects} from './features/redirects';
import {Lint, LintArgs, LintConfig, LintRawConfig} from './features/linter';
import {Changelogs, ChangelogsArgs, ChangelogsConfig} from './features/changelogs';
import {Html} from './features/html';
import {Search, SearchArgs, SearchConfig, SearchRawConfig} from './features/search';
import {Legacy, LegacyArgs, LegacyConfig, LegacyRawConfig} from './features/legacy';

export {getHooks};

export enum ResourceType {
    style = 'style',
    script = 'script',
    csp = 'csp',
}

// TODO: Move to isolated feature?
export type Resources = {
    [key in ResourceType]?: string[];
};

type BaseArgs = {output: AbsolutePath};

type BaseConfig = {
    lang: `${Lang}`;
    // TODO(patch): exetend langs list by newly supported langs or change type to string
    langs: `${Lang}`[];
    outputFormat: `${OutputFormat}`;
    varsPreset: string;
    vars: Hash;
    allowHtml: boolean;
    sanitizeHtml: boolean;
    ignoreStage: string[];
    ignore: string[];
    addSystemMeta: boolean;
    // TODO(minor): we can generate this file all time
    addMapFile: boolean;
    // TODO(major): can this be solved by `when` prop in toc?
    removeHiddenTocItems: boolean;
    mergeIncludes: boolean;
    // TODO(major): use as default behavior
    staticContent: boolean;
    allowCustomResources: boolean;
    resources: Resources;
    // TODO: explicitly handle
    analytics: DocAnalytics;
};

export type {Run};

const command = 'Build';

export type BuildArgs = ProgramArgs &
    BaseArgs &
    Partial<
        TemplatingArgs &
            ContributorsArgs &
            SinglePageArgs &
            LintArgs &
            ChangelogsArgs &
            SearchArgs &
            LegacyArgs
    >;

export type BuildRawConfig = BaseArgs &
    ProgramConfig &
    BaseConfig &
    TemplatingRawConfig &
    ContributorsConfig &
    SinglePageConfig &
    LintRawConfig &
    ChangelogsConfig &
    SearchRawConfig &
    LegacyRawConfig;

export type BuildConfig = Config<
    BaseArgs &
        ProgramConfig &
        BaseConfig &
        TemplatingConfig &
        ContributorsConfig &
        SinglePageConfig &
        LintConfig &
        ChangelogsConfig &
        SearchConfig &
        LegacyConfig
>;

export class Build
    // eslint-disable-next-line new-cap
    extends BaseProgram<BuildConfig, BuildArgs>(command, {
        config: {
            scope: 'build',
            defaults: () =>
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
                    resources: [],
                    allowCustomResources: false,
                    staticContent: false,
                    ignoreStage: [Stage.SKIP],
                    addSystemMeta: false,
                    lint: {enabled: true, config: {'log-levels': {}}},
                }) as Partial<BuildConfig>,
        },
        command: {
            isDefault: true,
        },
    })
    implements IProgram<BuildArgs>
{
    readonly [Hooks] = hooks();

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
    ];

    apply(program?: IProgram) {
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

        this[Hooks].BeforeRun.for('md').tap('Build', (run) => {
            getTocHooks(run.toc).Resolved.tapPromise('Build', async (toc, path) => {
                await run.write(join(run.output, path), run.toc.dump(toc));
            });
        });

        this[Hooks].AfterRun.for('md').tapPromise('Build', async (run) => {
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

        await this[Hooks].BeforeAnyRun.promise(run);
        await this[Hooks].BeforeRun.for(this.config.outputFormat).promise(run);

        await run.copy(run.originalInput, run.input, ['node_modules/**', '*/node_modules/**']);

        await run.vars.init();
        await run.toc.init();

        const excluded = await run.glob(['**/*.md', '**/index.yaml', ...run.config.ignore], {
            cwd: run.input,
            ignore: ['**/_*/**/*', '**/_include--*'].concat(run.toc.entries),
        });

        for (const file of excluded) {
            await run.remove(join(run.input, file));
        }
        await Promise.all([handler(run), this[Hooks].Run.promise(run)]);

        await this[Hooks].AfterRun.for(this.config.outputFormat).promise(run);
        await this[Hooks].AfterAnyRun.promise(run);

        await run.copy(run.output, run.originalOutput);

        await this[Hooks].Cleanup.promise(run);
        await cleanup(run);
    }
}

async function cleanup(run: Run) {
    await run.remove(run.input);
    await run.remove(run.output);
}
