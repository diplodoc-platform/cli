import type {Logger} from '~/logger';
import type {Command, ExtendedOption} from '~/core/config';

export interface ICallable<TArgs extends BaseArgs = BaseArgs> {
    apply(program?: IProgram<TArgs>): void;
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
export interface IProgram<Args extends BaseArgs = BaseArgs> extends ICallable<Args> {
    command: Command;

    options: Readonly<ExtendedOption[]>;

    parent?: IParent;

    action?: (props: Args) => Promise<void> | void;

    logger: Logger;
}

export interface IExtension<Program extends IProgram = IProgram> {
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
