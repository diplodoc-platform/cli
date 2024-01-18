import type {ICallable, IParent, IProgram} from './types';
import {resolve} from 'node:path';
import {omit} from 'lodash';
import {SyncWaterfallHook} from 'tapable';

import {Command, configRoot} from '~/config';
import {YFM_CONFIG_FILENAME} from '~/constants';
import {Build, Publish, translate, xliff} from '~/cmd';

import {NAME, USAGE, options} from './config';
import {HandledError, isRelative} from './utils';
import {BaseProgram} from './base';

export type {IProgram, IParent, ICallable};
export {options, HandledError, BaseProgram};

export type ExtensionInfo = {
    path: string;
    options: Record<string, any>;
};

export type ProgramConfig = {
    input: string;
    config: string;
    extensions: ExtensionInfo[];
    quiet: boolean;
    strict: boolean;
};

export type ProgramArgs = {
    input: string;
    config: string;
    extensions: string[];
    quiet: boolean;
    strict: boolean;
};

const hooks = () => ({
    Extension: new SyncWaterfallHook<ICallable>(['extension'], 'Program.Extension'),
});

export type ProgramHooks = ReturnType<typeof hooks>;

export class Program
    // eslint-disable-next-line new-cap
    extends BaseProgram<ProgramConfig, ProgramArgs, ProgramHooks>('Program', {
        config: {
            defaults: () => ({
                extensions: [] as ExtensionInfo[],
            }),
        },
        hooks: hooks(),
    })
    implements IProgram
{
    readonly command: Command = new Command(NAME)
        .helpOption(false)
        .allowUnknownOption(true)
        .version(
            typeof VERSION !== 'undefined' ? VERSION : '',
            '--version',
            'Output the version number',
        )
        .usage(USAGE);

    readonly build = new Build();

    readonly publish = new Publish();

    protected options = [
        options.input('./'),
        options.config(YFM_CONFIG_FILENAME),
        options.extensions,
        options.quiet,
        options.strict,
    ];

    private readonly modules: ICallable[] = [this.build, this.publish];

    apply() {
        this.hooks.Config.tap('Program', (config, args) => {
            Object.assign(config, omit(args, ['extensions']));

            // args extension paths should be relative to PWD
            const argsExtensions: ExtensionInfo[] = (args.extensions || []).map((ext: string) => {
                const path = isRelative(ext) ? resolve(ext) : ext;
                const options = {};

                return {path, options};
            });

            // config extension paths should be relative to config
            const configExtensions: ExtensionInfo[] = (config.extensions || []).map(
                (ext: ExtensionInfo | string) => {
                    const extPath = typeof ext === 'string' ? ext : ext.path;
                    const path = isRelative(extPath)
                        ? resolve(config[configRoot], extPath)
                        : extPath;
                    const options = typeof ext === 'string' ? {} : ext.options || {};

                    return {path, options};
                },
            );

            config.extensions = [...argsExtensions, ...configExtensions];

            return config;
        });
    }

    async action() {
        this.modules.push(...(await this.hookExtensions()));

        for (const module of this.modules) {
            module.apply(this);
        }

        this.hooks.Command.call(this.command);

        // There command was fully initialized
        // and on next run this action will not be called.
        // Instead will be called action of some subprogram.
        await this.command.helpOption(true).allowUnknownOption(false).parseAsync(this.args);
    }

    private async hookExtensions() {
        const build = async ({path, options}: {path: string; options: Record<string, unknown>}) => {
            const ExtensionModule = await import(path);
            const Extension = ExtensionModule.Extension || ExtensionModule.default;

            return this.hooks.Extension.call(new Extension(options));
        };

        return Promise.all(this.config.extensions.map(build));
    }
}
