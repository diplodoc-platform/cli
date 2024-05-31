import type {IProgram, Program, ProgramArgs, ProgramConfig} from '~/program';
import type {Config} from '~/config';
import {ok} from 'node:assert';
import {pick} from 'lodash';
import {AsyncParallelHook, AsyncSeriesHook, HookMap} from 'tapable';
import {BaseProgram} from '~/program/base';
import {Stage, YFM_CONFIG_FILENAME} from '~/constants';
import {Command, defined, deprecated} from '~/config';
import {OutputFormat, options} from './config';
import {Run} from './run';

import {Templating, TemplatingArgs, TemplatingConfig} from './features/templating';
import {Publishing, PublishingArgs, PublishingConfig} from './features/publishing';
import {Contributors, ContributorsArgs, ContributorsConfig} from './features/contributors';
import {SinglePage, SinglePageArgs, SinglePageConfig} from './features/singlepage';
import {Redirects} from './features/redirects';
import {Lint, LintArgs, LintConfig} from './features/linter';

type BaseArgs = {output: string};

type BaseConfig = {
    outputFormat: `${OutputFormat}`;
    varsPreset: string;
    vars: Hash;
    allowHtml: boolean;
    // TODO(minor): string[]
    ignoreStage: string;
    hidden: string[];
    addSystemMeta: boolean;
    addMapFile: boolean;
    removeHiddenTocItems: boolean;
    // TODO(major): wtf? if we don't need to build, why we call build command?
    buildDisabled: boolean;
    resources: string[];
    allowCustomResources: boolean;
    // TODO(major): use as default behavior
    staticContent: boolean;
};

export type {Run};

const command = 'Build';

const hooks = () => ({
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
    Partial<TemplatingArgs & ContributorsArgs & PublishingArgs & SinglePageArgs & LintArgs>;

export type BuildConfig = Config<
    BaseArgs &
    ProgramConfig &
    BaseConfig &
    TemplatingConfig &
    PublishingConfig &
    ContributorsConfig &
    SinglePageConfig &
    LintConfig
>;

export type BuildHooks = ReturnType<typeof hooks>;

export class Build
    // eslint-disable-next-line new-cap
    extends BaseProgram<BuildConfig, BuildArgs, BuildHooks>(command, {
        config: {
            scope: 'build',
            defaults: () => ({
                outputFormat: OutputFormat.html,
                varsPreset: 'default',
                vars: {},
                hidden: [],
                allowHtml: true,
                addMapFile: false,
                removeHiddenTocItems: false,
                resources: [],
                allowCustomResources: false,
                staticContent: false,
                ignoreStage: Stage.SKIP,
                addSystemMeta: false,
                buildDisabled: false,
                lint: {enabled: true, config: {'log-levels': {}}},
            }),
        },
        command: {
            isDefault: true,
        },
        hooks: hooks(),
    })
    implements IProgram<BuildArgs>
{
    readonly templating = new Templating();

    readonly publishing = new Publishing();

    readonly contributors = new Contributors();

    readonly singlepage = new SinglePage();

    readonly redirects = new Redirects();

    readonly linter = new Lint();

    readonly command = new Command('build').description('Build documentation in target directory');

    protected options = [
        options.input(),
        options.output(),
        options.outputFormat,
        options.varsPreset,
        options.vars,
        options.allowHtml,
        options.allowHTML,
        options.addMapFile,
        options.removeHiddenTocItems,
        options.resources,
        options.allowCustomResources,
        options.staticContent,
        options.addSystemMeta,
        options.hidden,
        options.ignoreStage,
        options.config(YFM_CONFIG_FILENAME),
        options.buildDisabled,
    ];

    apply(program?: Program) {
        this.templating.apply(this);
        this.publishing.apply(this);
        this.contributors.apply(this);
        this.singlepage.apply(this);
        this.redirects.apply(this);
        this.linter.apply(this);

        super.apply(program);

        this.hooks.Config.tap('Build', (config, args) => {
            const options = this.options.map((option) => option.attributeName());

            const allowHtml = defined('allowHtml', args, config);
            const allowHTML = defined('allowHTML', args, config);

            ok(
                (allowHtml !== null && allowHTML !== null && allowHtml === allowHTML) ||
                allowHtml === null ||
                allowHTML === null,
                'Options conflict: both allowHtml and allowHTML are configured',
            );

            Object.assign(config, pick(args, options));

            deprecated(config, 'allowHTML', () => config.allowHtml);

            return config;
        });
    }

    async action() {
        const run = new Run(this.config);

        console.log(this.config);

        run.logger.pipe(this.logger);

        await this.hooks.BeforeAnyRun.promise(run);
        await this.hooks.BeforeRun.for(this.config.outputFormat).promise(run);
        await Promise.all([this.handler(run), this.hooks.Run.promise(run)]);
        await this.hooks.AfterRun.for(this.config.outputFormat).promise(run);
        await this.hooks.AfterAnyRun.promise(run);
    }

    /**
     * Loads handler in async mode to not initialise all deps on startup.
     */
    private async handler(run: Run) {
        // @ts-ignore
        const {handler} = await import('./handler');

        return handler(run);
    }
}
