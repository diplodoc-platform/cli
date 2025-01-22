import type {BaseArgs, BaseConfig, ExtensionInfo, IBaseProgram, ICallable} from './types';
import type {Command, Config, ExtendedOption} from '~/core/config';

import {isAbsolute, resolve} from 'node:path';
import {once, pick} from 'lodash';
import log from '@diplodoc/transform/lib/log';

import {
    resolveConfig,
    scope as scopeConfig,
    strictScope as strictScopeConfig,
    withConfigUtils,
} from '~/core/config';
import {Logger, stats} from '~/core/logger';

import {Hooks, getHooks, hooks} from './hooks';
import {HandledError} from './utils';

export * from './types';

export {getHooks};

const isRelative = (path: string | undefined) => /^\.{1,2}\//.test(path || '');

const YFM_CONFIG_FILENAME = '.yfm';

type ProgramParts<TConfig extends BaseConfig> = {
    config?: {
        defaults?: () => Partial<TConfig>;
        scope?: string;
        strictScope?: string;
    };
    command?: {
        isDefault?: boolean;
    };
};

export const BaseProgram = <
    TConfig extends BaseConfig = BaseConfig,
    TArgs extends BaseArgs = BaseArgs,
>(
    name: string,
    parts: ProgramParts<TConfig>,
) => {
    const {
        config: {defaults = () => ({}), scope, strictScope} = {},
        command: {isDefault = false} = {},
    } = parts;

    return class BaseProgram implements IBaseProgram<TConfig, TArgs> {
        readonly [Hooks] = hooks<TConfig, TArgs>(name);

        readonly command!: Command;

        readonly config!: Config<TConfig>;

        readonly logger: Logger = new Logger();

        readonly options!: ExtendedOption[];

        protected modules: ICallable[] = [];

        protected extensions: (string | ExtensionInfo)[] = [];

        protected args: string[] = [];

        constructor(config?: BaseConfig & TConfig) {
            if (config) {
                this.config = withConfigUtils(process.cwd(), {
                    ...defaults(),
                    ...config,
                });
            }
        }

        async init(args: BaseArgs, parent?: IBaseProgram) {
            this.logger.setup(args);

            // @ts-ignore
            const config = parent?.config || (await this.hookConfig(args as TArgs));

            this.logger.setup(config);

            const extensions = await this.resolveExtensions(config, args);

            this.modules.push(...extensions);

            this.options.forEach((option) => {
                this.command.addOption(option);
            });

            this.command.action(() => this._action());

            for (const module of this.modules) {
                if (isProgram(module)) {
                    await module.init(args, this);
                } else {
                    module.apply(this);
                }
            }

            this.apply(parent);
        }

        apply(program?: IBaseProgram) {
            // @ts-ignore
            this['parent'] = program;

            if (program) {
                getHooks(program).Command.tap(
                    name,
                    once((command) => {
                        command.addCommand(this.command, {isDefault});
                        this[Hooks].Command.call(this.command, this.options);
                    }),
                );
                this.logger.pipe(program.logger);
            } else {
                this[Hooks].Command.call(this.command, this.options);
            }
        }

        async parse(args: string[]) {
            this.args = args;
            return this.command.parseAsync(args);
        }

        async action(_args: TArgs) {
            throw new Error('Should be implemented');
        }

        protected async hookConfig(args: TArgs) {
            const configPath =
                isAbsolute(args.config) || isRelative(args.config)
                    ? resolve(args.config)
                    : resolve(args.input, args.config);

            const filter =
                (strictScope && strictScopeConfig(strictScope)) || (scope && scopeConfig(scope));

            const config =
                this.config ||
                (await resolveConfig(configPath, {
                    filter: filter || undefined,
                    defaults: defaults(),
                    fallback: args.config === YFM_CONFIG_FILENAME ? defaults() : null,
                }));

            await this[Hooks].RawConfig.promise(config, args);

            const options = this.options.map((option) => option.attributeName());

            Object.assign(config, pick(args, options));

            return this[Hooks].Config.promise(config, args);
        }

        private async post() {
            const stat = stats(this.logger);
            if (stat.error || (this.config.strict && stat.warn)) {
                throw new HandledError('There is some processing errors.');
            }

            const {error, warn} = log.get();
            if (error.length || (this.config.strict && warn.length)) {
                throw new HandledError('There is some processing errors.');
            }
        }

        private async _action() {
            const args = this.command.optsWithGlobals() as TArgs;

            // We already parse config in to init method,
            // but there we need to rebuild it,
            // because some extensions may affect config parsing.
            // @ts-ignore
            this['config'] = await this.hookConfig(args);

            await this.action(args);
            await this.post();
        }

        private async resolveExtensions(config: Config<BaseConfig>, args: BaseArgs) {
            // args extension paths should be relative to PWD
            const argsExtensions: ExtensionInfo[] = (args.extensions || []).map((ext) => {
                const path = isRelative(ext) ? resolve(ext) : ext;
                const options = {};

                return {path, options};
            });

            // config extension paths should be relative to config
            const configExtensions: ExtensionInfo[] = [
                ...this.extensions,
                ...(config.extensions || []),
            ].map((ext) => {
                const extPath = typeof ext === 'string' ? ext : ext.path;
                const path = isRelative(extPath) ? config.resolve(extPath) : extPath;
                const options = typeof ext === 'string' ? {} : ext.options || {};

                return {path, options};
            });

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
    };
};

function isProgram<TArgs extends BaseArgs>(module: unknown): module is IBaseProgram<TArgs> {
    return Boolean(module && typeof (module as IBaseProgram).init === 'function');
}
