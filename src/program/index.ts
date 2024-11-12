import type {ICallable, IParent, IProgram} from './types';
import {resolve} from 'node:path';

import {Command, Config} from '~/config';
import {YFM_CONFIG_FILENAME} from '~/constants';
import {Build, Publish, Translate} from '~/commands';

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
    input: AbsolutePath;
    config: string;
    extensions: ExtensionInfo[];
    quiet: boolean;
    strict: boolean;
};

export type ProgramArgs = {
    input: AbsolutePath;
    config: string;
    extensions: string[];
    quiet: boolean;
    strict: boolean;
};

export class Program
    // eslint-disable-next-line new-cap
    extends BaseProgram<ProgramConfig, ProgramArgs>('Program', {
        config: {
            defaults: () => ({
                extensions: [] as ExtensionInfo[],
            }),
        },
    })
    implements IProgram<ProgramArgs>
{
    readonly command: Command = new Command(NAME)
        .helpOption(true)
        .allowUnknownOption(false)
        .version(
            typeof VERSION !== 'undefined' ? VERSION : '',
            '--version',
            'Output the version number',
        )
        .usage(USAGE);

    readonly build = new Build();

    readonly publish = new Publish();

    readonly translate = new Translate();

    readonly options = [
        options.input('./'),
        options.config(YFM_CONFIG_FILENAME),
        options.extensions,
        options.quiet,
        options.strict,
    ];

    private readonly parser: Command = new Command(NAME)
        .addOption(options.input('./'))
        .addOption(options.config(YFM_CONFIG_FILENAME))
        .addOption(options.extensions)
        .helpOption(false)
        .allowUnknownOption(true);

    private readonly modules: ICallable<ProgramArgs>[] = [this.build, this.publish, this.translate];

    async init(argv: string[]) {
        const args = this.parser.parse(argv).opts() as ProgramArgs;
        const config = await this.hookConfig(args);

        this.modules.push(...(await this.resolveExtensions(config, args)));

        for (const module of this.modules) {
            module.apply(this);
        }

        this.apply();
    }

    private async resolveExtensions(config: Config<ProgramConfig>, args: ProgramArgs) {
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
                const path = isRelative(extPath) ? config.resolve(extPath) : extPath;
                const options = typeof ext === 'string' ? {} : ext.options || {};

                return {path, options};
            },
        );

        const extensions = [...argsExtensions, ...configExtensions];

        const initialize = async ({
            path,
            options,
        }: {
            path: string;
            options: Record<string, unknown>;
        }) => {
            const ExtensionModule = await import(path);
            const Extension = ExtensionModule.Extension || ExtensionModule.default;

            return new Extension(options);
        };

        return Promise.all(extensions.map(initialize));
    }
}
