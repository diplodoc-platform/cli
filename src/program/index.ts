import type {Config} from '~/config';
import type {ProgramArgs, ProgramConfig} from './types';
import {isAbsolute, resolve} from 'node:path';
import {AsyncSeriesWaterfallHook, Hook, HookMap, SyncHook, SyncWaterfallHook} from 'tapable';

import {Command, configRoot, resolveConfig} from '~/config';
import {MAIN_TIMER_ID, YFM_CONFIG_FILENAME} from '~/constants';
import {Build, Publish, translate, xliff} from '~/cmd';

import {NAME, USAGE, options} from './config';
import {HandledError, isRelative} from './utils';

export type {ProgramConfig, ProgramArgs};

export {options};

/**
 * Program should follow some simple rules:
 * 1. It is a base independent unit which can contain subprograms or do something by itself.
 *    (NOT BOTH)
 * 2. Required 'apply' method serves for: ```
 * - initial data binding
 * - subprograms initialisation
 * - hooks subscription
 * - error handling
 * ```
 * 3. Program can be subprogram. This can be detected by non empty param passed to `apply` method.
 *    But anyway program should be independent unit.
 * 4. Optional 'action' method - is a main place for hooks call.
 *    For compatibility with Commander.Command->action methos result shoul be void.
 * 5. Complex hook calls should be designed as external private methods named as 'hookMethodName'
 *    (example: hookConfig)
 */
export interface IProgram extends ICallable {
    command: Command;

    action?: (props: ProgramArgs) => Promise<void> | void;

    hooks?: Record<string, Hook<any, any> | HookMap<any>>;
}

export interface ICallable {
    apply(program?: Program): Promise<void> | void;
}

export class Program implements IProgram {
    readonly hooks = {
        Config: new AsyncSeriesWaterfallHook<[Config<ProgramConfig>, Record<string, any>]>(
            ['config', 'args'],
            'Program.Config',
        ),
        Command: new SyncHook<Command>(['command'], 'Program.Command'),
        Extension: new SyncWaterfallHook<ICallable>(['extension'], 'Program.Extension'),
    };

    readonly build = new Build();

    readonly publish = new Publish();

    readonly config!: Readonly<Config<ProgramConfig>>;

    readonly command: Command = new Command(NAME)
        .addOption(options.config(this, YFM_CONFIG_FILENAME))
        .addOption(options.extensions(this))
        .addOption(options.quiet)
        .addOption(options.strict)
        .version(
            typeof VERSION !== 'undefined' ? VERSION : '',
            '--version',
            'Output the version number',
        )
        .usage(USAGE);

    private props: Command = new Command()
        .helpOption(false)
        .allowUnknownOption()
        .addOption(options.config(this, YFM_CONFIG_FILENAME))
        .addOption(options.extensions(this))
        .addOption(options.input(this, './'))
        .addOption(options.quiet);

    private modules!: ICallable[];

    constructor(readonly args: string[]) {}

    async apply() {
        console.time(MAIN_TIMER_ID);

        const props = this.props.parse(this.args).opts() as ProgramArgs;
        try {
            await this.action(props);
        } catch (error: any) {
            console.error(error.message || error);
            process.exit(1);
        }
        // const {error, result} = await this.action(props);

        // if (error) {
        //     if (!(error instanceof HandledError)) {
        //         console.error(error);
        //     }
        // } else {
        //     console.log(result);
        // }

        console.timeEnd(MAIN_TIMER_ID);
        process.exit(error ? 1 : 0);
    }

    async action(args: ProgramArgs) {
        // @ts-ignore
        this['config'] = await this.hookConfig(args);
        this['modules'] = await this.hookExtensions(args);

        await this.modules.reduce(
            (promise, module) => promise.then(() => module.apply(this)),
            Promise.resolve(),
        );

        this.hooks.Command.call(this.command);

        await this.command.parseAsync(this.args);

        // return {};
        // return new Promise((resolve) => {
        //     yargs.parse(this.args, {}, (error, {strict}, result) => {
        //         if (error) {
        //             resolve({error});
        //         } else {
        //             const {warn, error} = log.get();
        //
        //             if (error.length || strict && warn.length) {
        //                 resolve({error: new HandledError()});
        //             } else {
        //                 resolve({result});
        //             }
        //         }
        //     });
        // });
    }

    private async hookConfig(props: ProgramArgs) {
        const configPath =
            isAbsolute(props.config) || isRelative(props.config)
                ? resolve(props.config)
                : resolve(props.input, props.config);

        const defaults: ProgramConfig = {
            extensions: [],
        };

        const config = await resolveConfig(configPath, {
            defaults: defaults,
            fallback: props.config === YFM_CONFIG_FILENAME ? defaults : null,
        });

        return this.hooks.Config.promise(config, props);
    }

    private async hookExtensions(props: ProgramArgs) {
        const build = async (path: string, options: Record<string, any>) => {
            const ExtensionModule = await import(path);
            const Extension = ExtensionModule.Extension || ExtensionModule.default;

            return this.hooks.Extension.call(new Extension(options));
        };

        const modules: ICallable[] = [this.build, this.publish];

        for (const ext of props.extensions) {
            const path = isRelative(ext) ? resolve(ext) : ext;
            const options = {};

            modules.push(await build(path, options));
        }

        for (const ext of this.config.extensions) {
            const extPath = typeof ext === 'string' ? ext : ext.path;
            const path = isRelative(extPath) ? resolve(this.config[configRoot], extPath) : extPath;
            const options = typeof ext === 'string' ? {} : ext.options || {};

            modules.push(await build(path, options));
        }

        return modules;
    }
}
