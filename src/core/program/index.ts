import type {BaseArgs, BaseConfig, ExtensionInfo, ICallable, Report} from './types';
import type {Command, Config, ExtendedOption} from '~/core/config';
import type {HookMeta} from '~/core/utils';

import {isAbsolute, resolve} from 'node:path';
import {omit, once, pick, merge} from 'lodash';

import {
    resolveConfig,
    scope as scopeConfig,
    strictScope as strictScopeConfig,
    withConfigUtils,
} from '~/core/config';
import {Logger} from '~/core/logger';
import {errorMessage, own} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {getConfigDefaults, getConfigScope, withConfigDefaults, withConfigScope} from './decorators';
import {isProgram, isRelative, requireExtension} from './utils';

export * from './types';

export {getHooks, withConfigDefaults, withConfigScope};

const YFM_CONFIG_FILENAME = '.yfm';

type Behavior = {
    isDefaultCommand?: boolean;
};

@withHooks
@withConfigDefaults(() => ({
    strict: false,
    quiet: false,
}))
/**
 * Program should follow some simple rules:
 * 1. It is a base independent unit which can contain subprograms or do something by itself.
 *    (NOT BOTH)
 * 2. Required 'apply' method serves for: ```
 *   - initial data binding
 *   - subprograms initialisation
 *   - hooks subscription
 *   - error handling
 * ```
 * 3. Program can be subprogram. This can be detected by non empty param passed to `apply` method.
 *    But anyway program should be independent unit.
 * 4. In most cases hook **execution** in 'apply' will be architecture mistake.
 * 5. Optional 'action' method - is a main place for hooks **execution**.
 *    For compatibility with Commander.Command->action method result should be void.
 * 6. Complex hook calls should be designed as external private methods named as 'hookMethodName'
 *    (example: hookConfig)
 */
export class BaseProgram<
    TConfig extends BaseConfig = BaseConfig,
    TArgs extends BaseArgs = BaseArgs,
> {
    static is(program: BaseProgram) {
        return program instanceof this;
    }

    readonly name: string = 'Base';

    readonly command!: Command;

    readonly config!: Config<TConfig>;

    readonly logger: Logger = new Logger();

    readonly options!: ExtendedOption[];

    get report(): Report {
        return this.parent ? this.parent.report : this._report;
    }

    protected modules: ICallable[] = [];

    protected extensions: (string | ExtensionInfo)[] = [];

    private _report: Report = {code: 0};

    private parent: BaseProgram | null = null;

    private behavior: Behavior = {};

    constructor(config?: BaseConfig & TConfig, behavior: Behavior = {}) {
        this.behavior = behavior;

        if (config) {
            const defaults = getConfigDefaults(this);
            this.config = withConfigUtils(process.cwd(), {
                ...defaults,
                ...config,
            });
        }
    }

    async init(args: BaseArgs, parent?: BaseProgram) {
        this.logger.setup(args);

        const config = parent?.config || (await this.resolveConfig(args as TArgs));
        const extensions = await this.resolveExtensions(config, args);

        // @ts-ignore
        this['config'] = parent?.config || (await this.hookConfig(config, args as TArgs));

        this.logger.setup(this['config']);

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

    apply(program?: BaseProgram) {
        const isDefault = this.behavior.isDefaultCommand;
        // @ts-ignore
        this['parent'] = program;

        if (program) {
            getHooks(program).Command.tap(
                this.name,
                once((command) => {
                    command.addCommand(this.command, {isDefault});
                    getHooks(this).Command.call(this.command, this.options);
                }),
            );
            this.logger.pipe(program.logger);
        } else {
            getHooks(this).Command.call(this.command, this.options);
        }
    }

    async parse(args: string[]) {
        return this.command.parseAsync(args);
    }

    async action(_args: TArgs) {
        throw new Error('Should be implemented');
    }

    args(args: Hash): TArgs {
        const options = this.options.map((option) => option.attributeName());

        return {
            ...this.parent?.args(args),
            ...pick(args, options),
        } as TArgs;
    }

    private async resolveConfig(args: TArgs) {
        const defaults = getConfigDefaults(this);
        const {scope, strictScope} = getConfigScope(this);
        const configPath =
            isAbsolute(args.config) || isRelative(args.config)
                ? resolve(args.config)
                : resolve(args.input, args.config);

        const filter =
            (strictScope && strictScopeConfig(strictScope)) || (scope && scopeConfig(scope));

        return resolveConfig(configPath, {
            filter: filter || undefined,
            defaults: defaults,
            fallback: args.config === YFM_CONFIG_FILENAME ? defaults : null,
        });
    }

    private async hookConfig(config: Config<TConfig>, args: TArgs) {
        await getHooks(this as BaseProgram).RawConfig.promise(config, args);

        merge(config, this.args(args));

        return getHooks(this as BaseProgram).Config.promise(config, args);
    }

    private async _action() {
        const args = this.command.optsWithGlobals() as TArgs;
        const config = await this.resolveConfig(args as TArgs);

        // We already parse config in to init method,
        // but there we need to rebuild it,
        // because some extensions may affect config parsing.
        // @ts-ignore
        this['config'] = await this.hookConfig(config, args);

        try {
            await this.action(args);
        } catch (error) {
            // eslint-disable-next-line no-ex-assign
            error = await getHooks(this as BaseProgram).Error.promise(error);

            if (!error) {
                return;
            }

            if (own<HookMeta, 'hook'>(error, 'hook')) {
                const {service, hook, name} = error.hook;
                // eslint-disable-next-line no-console
                console.error(
                    `Intercept error for ${service}.${hook} hook from ${name} extension.`,
                );
            }

            const message = errorMessage(error);
            if (message) {
                // eslint-disable-next-line no-console
                console.error(message);
            }

            this.report.code = error ? 1 : 0;
        }
    }

    private async resolveExtensions(config: Config<BaseConfig>, args: BaseArgs) {
        // args extension paths should be relative to PWD
        const argsExtensions: {
            name: string;
            options: Record<string, unknown>;
        }[] = (args.extensions || []).map((ext) => {
            const name = isRelative(ext) ? resolve(ext) : ext;
            const options = {};

            return {name, options};
        });

        // config extension paths should be relative to config
        const configExtensions: {
            name: string;
            options: Record<string, unknown>;
        }[] = [...this.extensions, ...(config.extensions || [])].map((ext) => {
            const extPath = typeof ext === 'string' ? ext : ext.name;
            const name = isRelative(extPath) ? config.resolve(extPath) : extPath;
            const options = typeof ext === 'string' ? {} : omit(ext, 'path');

            return {name, options};
        });

        const extensions = [...argsExtensions, ...configExtensions];

        const initialize = async ({
            name,
            options,
        }: {
            name: string;
            options: Record<string, unknown>;
        }) => {
            const ExtensionModule = requireExtension(name);
            const Extension = ExtensionModule.Extension || ExtensionModule.default;

            return new Extension(options);
        };

        return Promise.all(extensions.map(initialize));
    }
}
