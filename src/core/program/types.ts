import type {Command, ExtendedOption} from '~/core/config';
import type {Logger} from '~/core/logger';
import type {Hooks, hooks} from './hooks';

export interface ICallable {
    apply(program?: IBaseProgram): void;
}

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
 *    In most cases hook **execution** here will be archtecture mistake.
 *
 * 3. Program can be subprogram. This can be detected by non empty param passed to `apply` method.
 *    But anyway program should be independent unit.
 * 4. Optional 'action' method - is a main place for hooks call.
 *    For compatibility with Commander.Command->action method result should be void.
 * 5. Complex hook calls should be designed as external private methods named as 'hookMethodName'
 *    (example: hookConfig)
 */
export interface IProgram<Args extends BaseArgs = BaseArgs> {
    action: (props: Args) => Promise<void> | void;

    logger: Logger;
}

export interface IBaseProgram<TConfig = BaseConfig, TArgs = BaseArgs> extends ICallable {
    [Hooks]: ReturnType<typeof hooks<BaseConfig & TConfig, BaseArgs & TArgs>>;

    command: Command;

    options: Readonly<ExtendedOption[]>;

    init(args: BaseArgs, parent?: IBaseProgram): Promise<void>;

    config: TConfig;

    logger: Logger;
}

export interface IExtension<Program extends IBaseProgram = IBaseProgram> {
    apply(program: Program): void;
}

/**
 * Limited IProgram interface for access from sub programs.
 */
export interface IParent {
    command: Command;

    logger: Logger;
}

export type BaseArgs = {
    input: AbsolutePath;
    config: AbsolutePath;
    quiet: boolean;
    strict: boolean;
    extensions?: string[];
};

export type BaseConfig = {
    input: AbsolutePath;
    quiet: boolean;
    strict: boolean;
    extensions?: (string | ExtensionInfo)[];
};

export type ExtensionInfo = {
    path: string;
    options: Record<string, any>;
};
