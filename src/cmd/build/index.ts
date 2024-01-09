import type {IProgram, Program, ProgramArgs} from '~/program';
import type {Config} from '~/config';
import {ok} from 'node:assert';
import {isAbsolute, resolve} from 'node:path';
import {pick} from 'lodash';
import {AsyncSeriesHook, AsyncSeriesWaterfallHook, HookMap, SyncHook} from 'tapable';
import {Stage, YFM_CONFIG_FILENAME} from '~/constants';
import {argvValidator} from './validator';
import {Command, defined, deprecated, resolveConfig} from '~/config';
import {OutputFormat, options} from './config';
import {Run} from './run';

import {Templating, TemplatingConfig} from './features/templating';
import {Publishing, PublishingConfig} from './features/publishing';
import {Contributors, ContributorsConfig} from './features/contributors';
import {SinglePage, SinglePageConfig} from './features/singlepage';
import {Redirects} from './features/redirects';

const isRelative = (path: string) => /^\.{1,2}\//.test(path);

type BuildArgs = {
    input: string;
    output: string;
    config: string;
};

type BaseConfig = {
    outputFormat: `${OutputFormat}`;
    varsPreset: string;
    vars: Record<string, any>;
    allowHtml: boolean;
    // TODO: string[]
    ignoreStage: string;
    addSystemMeta: boolean;
    addMapFile: boolean;
    removeHiddenTocItems: boolean;
    // TODO(major): move to separated 'lint' command
    lintDisabled: boolean;
    // TODO: wtf? if we don't need to build, why we call build command?
    buildDisabled: boolean;
    allowCustomResources: boolean;
    // TODO(major): use as default behavior
    staticContent: boolean;
};

export type BuildConfig = Config<
    BuildArgs & BaseConfig & TemplatingConfig & PublishingConfig & ContributorsConfig & SinglePageConfig
>;

type ScopedBuildConfig = {
    build: BuildConfig;
};

export class Build implements IProgram {
    readonly templating = new Templating();

    readonly publishing = new Publishing();

    readonly contributors = new Contributors();

    readonly singlepage = new SinglePage();

    readonly redirects = new Redirects();

    readonly command = new Command('build').description('Build documentation in target directory');

    readonly hooks = {
        Command: new SyncHook<Command>(['command'], 'Build.Command'),
        Config: new AsyncSeriesWaterfallHook<[Record<string, any>, Record<string, any>]>(
            ['config', 'args'],
            'Build.Config',
        ),
        BeforeRun: new HookMap(
            (format: `${OutputFormat}`) =>
                new AsyncSeriesHook<Run>(['run'], `Build.${format}.BeforeRun`),
        ),
        AfterRun: new HookMap(
            (format: `${OutputFormat}`) =>
                new AsyncSeriesHook<Run>(['run'], `Build.${format}.AfterRun`),
        ),
    };

    readonly config!: BuildConfig;

    private parent: IProgram | undefined;

    private options = [
        options.input(this),
        options.output(this),
        options.outputFormat,
        options.varsPreset,
        options.vars(this),
        options.allowHtml,
        options.allowHTML,
        options.addMapFile,
        options.removeHiddenTocItems,
        options.allowCustomResources,
        options.staticContent,
        options.addSystemMeta,
        options.ignoreStage,
        options.config(this, YFM_CONFIG_FILENAME),
        options.lintDisabled,
        options.buildDisabled,
    ];

    async apply(program?: Program) {
        this.templating.apply(this);
        this.publishing.apply(this);
        this.contributors.apply(this);
        this.singlepage.apply(this);
        this.redirects.apply(this);

        this.parent = program;

        const setupCommand = () => {
            this.options.forEach((option) => {
                this.command.addOption(option);
            });
            this.command.action((args: ProgramArgs) => this.action(args));
            this.hooks.Command.call(this.command);

            // return argv.command({
            //     builder: (argv: Argv) => {
            //         return argv
            //             .check(argvValidator)
            //     },
            // });
        };

        if (this.parent) {
            this.parent.command.addCommand(this.command, {isDefault: true});
        }

        setupCommand();

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

    async action(args: ProgramArgs) {
        // @ts-ignore
        this['config'] = await this.hookConfig(args);

        const run = new Run(this.config);

        if (this.parent) {
            run.logger.pipe(this.parent.logger);
        }

        await this.hooks.BeforeRun.for(this.config.outputFormat).promise(run);
        await this.handler(run);
        await this.hooks.AfterRun.for(this.config.outputFormat).promise(run);
    }

    private async handler(run: Run) {
        // @ts-ignore
        const {handler} = await import('./handler');

        return handler(run);
    }

    private async hookConfig(args: ProgramArgs) {
        const configPath =
            isAbsolute(args.config) || isRelative(args.config)
                ? resolve(args.config)
                : resolve(args.input, args.config);

        const defaults: BaseConfig = {
            outputFormat: OutputFormat.html,
            varsPreset: 'default',
            vars: {},
            allowHtml: true,
            addMapFile: false,
            removeHiddenTocItems: false,
            allowCustomResources: false,
            staticContent: false,
            ignoreStage: Stage.SKIP,
            addSystemMeta: false,
            lintDisabled: false,
            buildDisabled: false,
        };

        const config = await resolveConfig<BaseConfig>(configPath, {
            filter: (data: ScopedBuildConfig | BuildConfig) =>
                (data as ScopedBuildConfig).build || data,
            defaults: defaults,
            fallback: args.config === YFM_CONFIG_FILENAME ? defaults : null,
        });

        return this.hooks.Config.promise(config, args);
    }
}
