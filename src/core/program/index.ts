import type {BaseArgs, BaseConfig, ExtensionInfo, ICallable, Report} from './types';
import type {Command, Config, ExtendedOption} from '~/core/config';
import type {HookMeta} from '~/core/utils';

import {isAbsolute, join, resolve} from 'node:path';
import {readFileSync, realpathSync, statSync} from 'node:fs';
import {merge, omit, once, pick} from 'lodash';

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

type ExtensionConfig = {
    name: string;
    options: Hash;
};

@withHooks
@withConfigDefaults(() => ({
    strict: false,
    quiet: false,
    originAsInput: false,
    copyOnWrite: true,
    workerMaxOldSpace: 0,
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

    /** Files declared during extension initialization or configuration, including parent modules. */
    get dependencies(): readonly AbsolutePath[] {
        return [
            ...(this.parent?.dependencies || []),
            ...this.declaredDependencies,
            ...[...this.localEntries].flatMap(([name, entry]) =>
                this.localEntryDependencies(name, entry),
            ),
        ];
    }

    protected modules: ICallable[] = [];

    protected extensions: (string | ExtensionInfo)[] = [];

    private _report: Report = {code: 0};

    private parent: BaseProgram | null = null;

    private behavior: Behavior = {};

    private declaredDependencies = new Set<AbsolutePath>();

    private localEntries = new Map<string, string>();

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
        const extensions = await this.resolveExtensions(config.extensions);

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

    addModule(module: ICallable) {
        this.modules.push(module);
    }

    /**
     * Declare a local helper or data path used before a Run exists.
     * Local extension entry points are automatic; their imported helpers and data are explicit.
     * Prepare resolves declarations through Run.depend, including declared directory subtrees.
     */
    depend(path: AbsolutePath): void {
        this.declaredDependencies.add(resolve(path) as AbsolutePath);
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

        const config = await resolveConfig(configPath, {
            filter: filter || undefined,
            defaults: defaults,
            fallback: args.config === YFM_CONFIG_FILENAME ? defaults : null,
        });

        config.extensions = this.normalizeExtensions(config as Config<BaseConfig>, args);

        return config;
    }

    private async hookConfig(config: Config<TConfig>, args: TArgs) {
        await getHooks(this as BaseProgram).RawConfig.promise(config, args);

        merge(config, omit(this.args(args), ['extensions']));

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
            if (message && !(error as {logged?: boolean} | undefined)?.logged) {
                // eslint-disable-next-line no-console
                console.error(message);
            }

            this.report.code = error ? 1 : 0;
        }
    }

    private normalizeExtensions(config: Config<BaseConfig>, args: BaseArgs) {
        const argsExtensions: ExtensionConfig[] = (args.extensions || []).map((ext) => {
            const name = isRelative(ext) ? resolve(ext) : ext;
            const options = {};

            return {name, options};
        });

        // config extension paths should be relative to config
        const configExtensions: ExtensionConfig[] = (config.extensions || []).map((ext) => {
            const extPath = typeof ext === 'string' ? ext : ext.name;
            const name = isRelative(extPath) ? config.resolve(extPath) : extPath;
            const options = typeof ext === 'string' ? {} : omit(ext, 'path');

            return {name, options};
        });

        return [...argsExtensions, ...configExtensions];
    }

    private async resolveExtensions(extensions: ExtensionConfig[]) {
        const initialize = async ({name, options}: ExtensionConfig) => {
            try {
                const ExtensionModule = requireExtension(name);
                if (isRelative(name) || isAbsolute(name)) {
                    const entry = require.resolve(name);
                    this.depend(entry as AbsolutePath);
                    this.localEntries.set(name, entry);
                }
                const Extension = ExtensionModule.Extension || ExtensionModule.default;

                return new Extension(options);
            } catch (error) {
                this.logger.error(
                    `Failed to load extension from ${name}: ${error instanceof Error ? error.message : String(error)}`,
                );
                throw error;
            }
        };

        return Promise.all(extensions.map(initialize));
    }

    /** Preserve local entry lookup inputs without declaring imported helpers or a directory tree. */
    private localEntryDependencies(name: string, entry: string): AbsolutePath[] {
        const paths: AbsolutePath[] = [];
        const file = (path: string) => {
            try {
                if (statSync(path).isFile() && realpathSync(path) === entry) {
                    paths.push(path as AbsolutePath);
                    return true;
                }
            } catch (error) {
                if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '')) {
                    throw error;
                }
            }
            return false;
        };
        const extensions = (path: string) =>
            [path, `${path}.js`, `${path}.json`, `${path}.node`].some(file);
        const index = (path: string) => extensions(join(path, 'index'));
        if (extensions(name)) {
            return paths;
        }

        const manifest = join(name, 'package.json');
        try {
            const info = JSON.parse(readFileSync(manifest, 'utf8')) as {main?: string};
            paths.push(manifest as AbsolutePath);
            if (typeof info.main === 'string') {
                const main = resolve(name, info.main);
                if (extensions(main) || index(main)) {
                    return paths;
                }
            }
        } catch (error) {
            if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '')) {
                throw error;
            }
        }
        index(name);
        return paths;
    }
}
