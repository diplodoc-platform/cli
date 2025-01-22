import type {BaseArgs, BaseConfig, ExtensionInfo, ICallable, IProgram} from './types';
import {resolve} from 'node:path';

import {Command, Config} from '~/core/config';
import {YFM_CONFIG_FILENAME} from '~/constants';
import {Build, Publish, Translate} from '~/commands';

import {NAME, USAGE, options} from './config';
import {HandledError, isRelative} from './utils';
import {BaseProgram} from './base';

export type * from './types';
export {options, HandledError, BaseProgram};

export class Program
    // eslint-disable-next-line new-cap
    extends BaseProgram<BaseConfig, BaseArgs>('Program', {
        config: {
            defaults: () => ({
                extensions: [] as ExtensionInfo[],
            }),
        },
    })
    implements IProgram<BaseArgs>
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

    private readonly modules: ICallable<BaseArgs>[] = [this.build, this.publish, this.translate];

    async init(argv: string[]) {
        const args = this.parser.parse(argv).opts() as BaseArgs;
        const config = await this.hookConfig(args);

        this.modules.push(...(await this.resolveExtensions(config, args)));

        for (const module of this.modules) {
            module.apply(this);
        }

        this.apply();
    }

    private async resolveExtensions(config: Config<BaseConfig>, args: BaseArgs) {
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
