import type {BaseArgs, BaseConfig, ExtensionInfo, ICallable, IParent, IProgram} from './types';
import type {Command, Config, ExtendedOption} from '~/core/config';

import {isAbsolute, resolve} from 'node:path';
import {once, pick} from 'lodash';
import log from '@diplodoc/transform/lib/log';

import {
    resolveConfig,
    scope as scopeConfig,
    strictScope as strictScopeConfig,
    withConfigUtils,
import {Logger, stats} from '~/logger';
import {YFM_CONFIG_FILENAME} from '~/constants';
} from '~/core/config';

import {Hooks, getHooks, hooks} from './hooks';
import {HandledError} from './utils';

export * from './types';

export {getHooks};

const isRelative = (path: string | undefined) => /^\.{1,2}\//.test(path || '');

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

    return class BaseProgram implements IProgram<TArgs> {
        readonly [Hooks] = hooks<TConfig, TArgs>(name);

        readonly command!: Command;

        readonly config!: Config<TConfig>;

        readonly parent!: IParent | undefined;

        readonly logger: Logger = new Logger();

        readonly options!: ExtendedOption[];

        protected modules: ICallable<TArgs>[] = [];

        protected args: string[] = [];

        constructor(config?: TConfig) {
            if (config) {
                this.config = withConfigUtils(process.cwd(), {
                    ...defaults(),
                    ...config,
                });
            }
        }

        async init(args: BaseArgs) {
            const config = await this.hookConfig(args as TArgs);
            const extensions = await this.resolveExtensions(config, args);

            this.modules.push(...extensions);

            this.apply();
        }

        apply(program?: IProgram<TArgs>) {
            // @ts-ignore
            this['parent'] = program;

            this.options.forEach((option) => {
                this.command.addOption(option);
            });
            this.command.action(() => this._action());

            for (const module of this.modules) {
                module.apply(this);
            }

            if (this.parent) {
                getHooks(this.parent).Command.tap(
                    name,
                    once((command) => {
                        command.addCommand(this.command, {isDefault});
                        this[Hooks].Command.call(this.command, this.options);
                    }),
                );
                this.logger.pipe(this.parent.logger);
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

        private async pre(args: TArgs) {
            this.logger.setup(args);

            // @ts-ignore
            this['config'] = await this.hookConfig(args);

            if (!this.parent) {
                this.resolveExtensions(this.config, args);
            }

            this.logger.setup(this.config);
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

            await this.pre(args);
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
            const configExtensions: ExtensionInfo[] = (config.extensions || []).map((ext) => {
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
