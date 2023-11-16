import type {Program} from '../..';
import {ok} from 'node:assert';
import {pick} from 'lodash';
import {SyncHook, AsyncSeriesHook, HookMap} from 'tapable';
import {TMP_INPUT_FOLDER, TMP_OUTPUT_FOLDER} from '../../constants';
import {argvValidator} from './validator';
import {Command} from '../../config';
import {options, resolveConfig, OutputFormat} from './config';
import { deprecated, defined } from '../../config/utils';

import {Templating, TemplatingConfig} from './features/templating';
import {Contributors, ContributorsConfig} from './features/contributors';
import {SinglePage, SinglePageConfig} from './features/singlepage';
import {resolve} from 'path';
import { logger } from '../../utils';
import { processLogs } from '../../steps';
import shell from 'shelljs';

type BaseConfig = {
    input: string;
    output: string;
    outputFormat: OutputFormat;
    varsPreset: string;
    vars: Record<string, string>;
    allowHtml: boolean;
    // TODO: string[]
    ignoreStage: string;
    addSystemMeta: boolean;
    addMapFile: boolean;
    publish: boolean;
    removeHiddenTocItems: boolean;
    // TODO(major): move to saparated 'lint' command
    lintDisabled: boolean;
    // TODO: wtf? if we don't need to build, wy we call build command?
    buildDisabled: boolean;
    allowCustomResources: boolean;
    // TODO(major): use as default behavior
    staticContent: boolean;
};

export type Config = BaseConfig & TemplatingConfig & ContributorsConfig & SinglePageConfig;

class Run {
    readonly root: string;

    readonly input: string;

    readonly output: string;

    readonly logger: any;

    constructor(public readonly config: Readonly<Config>) {
        this.root = config.input;
        deprecated(this, 'rootInput', () => config.input);

        this.input = resolve(config.output, TMP_INPUT_FOLDER);
        this.output = resolve(config.output, TMP_OUTPUT_FOLDER);
    }
}

export class Build {
    readonly templating = new Templating();

    readonly contributors = new Contributors();

    readonly singlepage = new SinglePage();

    readonly command = new Command('build')
        .description('Build documentation in target directory');

    readonly hooks = {
        Command: new SyncHook<Command>(['command'], 'Build.Command'),
        Config: new AsyncSeriesHook<[Record<string, any>, Record<string, any>]>(['config', 'args'], 'Build.Config'),
        BeforeRun: new HookMap((format: `${OutputFormat}`) => new AsyncSeriesHook<Run>(['run'], `Build.${format}.BeforeRun`)),
        Run: new HookMap((format: `${OutputFormat}`) => new AsyncSeriesHook<Run>(['run'], `Build.${format}.Run`)),
        AfterRun: new HookMap((format: `${OutputFormat}`) => new AsyncSeriesHook<Run>(['run'], `Build.${format}.AfterRun`)),
    };

    options = [
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
        options.ignoreStage,
        options.addSystemMeta,
        options.lintDisabled,
        options.buildDisabled,
        options.publish,
    ];

    async apply(program: Program) {
        this.templating.apply(this);
        this.contributors.apply(this);
        this.singlepage.apply(this);

        program.hooks.Command.tap('Build', (command) => {
            command.addCommand(this.command, {isDefault: true});

            this.options.forEach((option) => {
                this.command.addOption(option);
            });

            this.hooks.Command.call(this.command);

            this.command.action(this.action);


            // return argv.command({
            //     command: ['build', '$0'],
            //     describe: 'Build documentation in target directory',
            //     handler: async (args: Arguments<any>) => {
            //         const {handler} = await import('./handler');
            //
            //         await handler(args);
            //     },
            //     builder: (argv: Argv) => {
            //         return argv
            //             .options(options)
            //             .check(argvValidator)
            //             .example('yfm -i ./input -o ./output', '')
            //             .demandOption(
            //                 ['input', 'output'],
            //                 'Please provide input and output arguments to work with this tool',
            //             );
            //     },
            // });
        });

        this.hooks.Config.tap('Build', (config, args) => {
            const options = this.options.map((option) => option.attributeName());

            // TODO: load config
            // TODO: init logger

            const allowHtml = defined('allowHtml', args, config);
            const allowHTML = defined('allowHTML', args, config);

            ok(allowHtml !== null && allowHTML !== null, 'Options conflict: both allowHtml and allowHTML are used');

            Object.assign(config, pick(args, options));

            deprecated(config, 'allowHTML', () => config.allowHtml);
        });
    }

    action = async (args) => {
        const {handler} = await import('./handler');

        const config = await resolveConfig(args.input, args.config);

        await this.hooks.Config.promise(config, args);

        const run = new Run(config);

        try {
            await this.hooks.BeforeRun.for(config.outputFormat).promise(run);
            await this.hooks.Run.for(config.outputFormat).promise(run);
            await this.hooks.AfterRun.for(config.outputFormat).promise(run);
        } catch (error: any) {
            run.logger.error('', error.message);
        } finally {
            processLogs(tmpInputFolder);

            shell.rm('-rf', tmpInputFolder, tmpOutputFolder);
        }

        // console.log('CALL BUILD WITH', args, config);

        // return handler(this.config);
    }
}
