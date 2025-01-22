import type {IParent, IProgram, ProgramArgs} from '.';
import type {Command, Config, ExtendedOption} from '~/core/config';
import {AsyncSeriesWaterfallHook, Hook, HookMap, SyncHook} from 'tapable';
import {isAbsolute, resolve} from 'node:path';
import {once} from 'lodash';
import {Logger, stats} from '~/core/logger';
import log from '@diplodoc/transform/lib/log';
import {
    resolveConfig,
    scope as scopeConfig,
    strictScope as strictScopeConfig,
    withConfigUtils,
} from '~/core/config';
import {YFM_CONFIG_FILENAME} from '~/constants';
import {HandledError} from './utils';

const isRelative = (path: string) => /^\.{1,2}\//.test(path);

export type BaseHooks<TConfig, TArgs> = {
    Command: SyncHook<[Command, ExtendedOption[]]>;
    /**
     * asasdasdasd
     */
    Config: AsyncSeriesWaterfallHook<[Config<TConfig>, TArgs]>;
};

export const BaseProgram = <
    TConfig extends Record<string, unknown>,
    TArgs extends ProgramArgs = ProgramArgs,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    THooks extends Record<string, Hook<any, any> | HookMap<any>> = BaseHooks<TConfig, TArgs>,
>(
    name: string,
    parts: {
        config?: {
            defaults?: () => Partial<TConfig>;
            scope?: string;
            strictScope?: string;
        };
        command?: {
            isDefault?: boolean;
        };
        hooks?: THooks;
    },
) => {
    const {
        config: {defaults = () => ({}), scope, strictScope} = {},
        hooks = {},
        command: {isDefault = false} = {},
    } = parts;

    return class BaseProgram implements IProgram<TArgs> {
        readonly command!: Command;

        readonly hooks = {
            Command: new SyncHook<[Command, ExtendedOption[]]>(
                ['command', 'options'],
                `${name}.Command`,
            ),
            Config: new AsyncSeriesWaterfallHook<[Config<TConfig>, TArgs]>(
                ['config', 'args'],
                `${name}.Config`,
            ),
            ...hooks,
        } as BaseHooks<TConfig, TArgs> & {
            // for best ide suggestion
            [prop in keyof THooks]: THooks[prop];
        };

        readonly config!: Config<TConfig>;

        readonly parent!:
            | IParent<{
                  Command: SyncHook<Command>;
              }>
            | undefined;

        readonly logger: Logger = new Logger();

        readonly options!: ExtendedOption[];

        protected args: string[] = [];

        constructor(config?: TConfig) {
            if (config) {
                this.config = withConfigUtils(process.cwd(), {
                    ...defaults(),
                    ...config,
                });
            }
        }

        apply(program?: IProgram<TArgs>) {
            // @ts-ignore
            this['parent'] = program;

            this.options.forEach((option) => {
                this.command.addOption(option);
            });
            this.command.action(() => this._action());

            if (this.parent) {
                this.parent.hooks.Command.tap(
                    name,
                    once((command) => {
                        command.addCommand(this.command, {isDefault});
                        this.hooks.Command.call(this.command, this.options);
                    }),
                );
                this.logger.pipe(this.parent.logger);
            } else {
                this.hooks.Command.call(this.command, this.options);
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

            return this.hooks.Config.promise(config, args);
        }

        private async pre(args: TArgs) {
            this.logger.setup(args);

            // @ts-ignore
            this['config'] = await this.hookConfig(args);

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
    };
};
