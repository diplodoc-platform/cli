import type {IProgram, ProgramArgs, ProgramConfig} from '~/program';
import type {DocAnalytics} from '@diplodoc/client';

import {ok} from 'node:assert';
import {join} from 'node:path';
import {pick} from 'lodash';
import {AsyncParallelHook, AsyncSeriesHook, HookMap} from 'tapable';

import {BaseProgram} from '~/program/base';
import {Lang, Stage, YFM_CONFIG_FILENAME} from '~/constants';
import {Command, Config, configPath, defined, valuable} from '~/config';
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

import {GenericIncluderExtension, OpenapiIncluderExtension} from './core/toc';

import shell from 'shelljs';
import {intercept} from '~/utils';

export type * from './types';

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
    // TODO(major): wtf? if we don't need to build, why we call build command?
    buildDisabled: boolean;
    allowCustomResources: boolean;
    resources: Resources;
    // TODO: explicitly handle
    analytics: DocAnalytics;
};

export type {Run};

const command = 'Build';

const hooks = () =>
    intercept(command, {
        /**
         * Async series hook which runs before start of any Run type.<br/><br/>
         * Args:
         * - run - [Build.Run](./Run.ts) constructed context.<br/>
         * Best place to subscribe on Run hooks.
         */
        BeforeAnyRun: new AsyncSeriesHook<Run>(['run'], `${command}.BeforeAnyRun`),
        /**
         * Async series hook map which runs before start of target Run type.<br/><br/>
         * Args:
         * - run - [Build.Run](./Run.ts) constructed context.<br/>
         * Best place to subscribe on target Run hooks.
         */
        BeforeRun: new HookMap(
            (format: `${OutputFormat}`) =>
                new AsyncSeriesHook<Run>(['run'], `${command}.${format}.BeforeRun`),
        ),
        /**
         * Async parallel hook which runs on start of any Run type.<br/><br/>
         * Args:
         * - run - [Build.Run](./Run.ts) constructed context.<br/>
         * Best place to do something in parallel with main build process.
         */
        Run: new AsyncParallelHook<Run>(['run'], `${command}.Run`),
        // TODO: decompose handler and describe this hook
        AfterRun: new HookMap(
            (format: `${OutputFormat}`) =>
                new AsyncSeriesHook<Run>(['run'], `${command}.${format}.AfterRun`),
        ),
        // TODO: decompose handler and describe this hook
        AfterAnyRun: new AsyncSeriesHook<Run>(['run'], `${command}.AfterAnyRun`),
    });

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

export type BuildHooks = ReturnType<typeof hooks>;

export class Build
    // eslint-disable-next-line new-cap
    extends BaseProgram<BuildConfig, BuildArgs, BuildHooks>(command, {
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
                    buildDisabled: false,
                    lint: {enabled: true, config: {'log-levels': {}}},
                }) as Partial<BuildConfig>,
        },
        command: {
            isDefault: true,
        },
        hooks: hooks(),
    })
    implements IProgram<BuildArgs>
{
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
        options.buildDisabled,
    ];

    apply(program?: IProgram) {
        this.hooks.Config.tap('Build', (config, args) => {
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

            const options = [...this.options, ...(program?.options || [])].map((option) =>
                option.attributeName(),
            );

            Object.assign(config, pick(args, options));

            config.ignoreStage = [].concat(ignoreStage);
            config.langs = langs;
            config.lang = lang || langs[0];

            return config;
        });

        this.hooks.BeforeRun.for('md').tap('Build', (run) => {
            run.toc.hooks.Resolved.tapPromise('Build', async (toc, path) => {
                await run.write(join(run.output, path), run.toc.dump(toc));
            });
        });

        this.hooks.AfterRun.for('md').tap('Build', async (run) => {
            // TODO: save normalized config instead
            if (run.config[configPath]) {
                shell.cp(run.config[configPath], run.output);
            }
        });

        this.templating.apply(this);
        this.contributors.apply(this);
        this.singlepage.apply(this);
        this.redirects.apply(this);
        this.linter.apply(this);
        this.changelogs.apply(this);
        this.search.apply(this);
        this.html.apply(this);
        this.legacy.apply(this);

        new GenericIncluderExtension().apply(this);
        new OpenapiIncluderExtension().apply(this);

        super.apply(program);
    }

    async action() {
        if (typeof VERSION !== 'undefined' && process.env.NODE_ENV !== 'test') {
            // eslint-disable-next-line no-console
            console.log(`Using v${VERSION} version`);
        }

        const run = new Run(this.config);

        run.logger.pipe(this.logger);

        // Create temporary input/output folders
        shell.rm('-rf', run.input, run.output);
        shell.mkdir('-p', run.input, run.output);

        await this.hooks.BeforeAnyRun.promise(run);
        await this.hooks.BeforeRun.for(this.config.outputFormat).promise(run);

        await run.copy(run.originalInput, run.input, ['node_modules/**', '*/node_modules/**']);

        await run.vars.init();
        await run.toc.init();

        await Promise.all([handler(run), this.hooks.Run.promise(run)]);

        await this.hooks.AfterRun.for(this.config.outputFormat).promise(run);
        await this.hooks.AfterAnyRun.promise(run);

        await run.copy(run.output, run.originalOutput);

        shell.rm('-rf', run.input, run.output);
    }
}
