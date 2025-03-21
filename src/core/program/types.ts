import type {BaseProgram} from './';

export interface ICallable {
    apply(program?: BaseProgram): void;
}

export interface IExtension<Program extends BaseProgram = BaseProgram> {
    apply(program: Program): void;
}

export type BaseArgs = {
    input: AbsolutePath;
    config: AbsolutePath;
    quiet: boolean;
    strict: boolean;
    jobs: number | true;
    extensions?: string[];
};

export type BaseConfig = {
    input: AbsolutePath;
    quiet?: boolean;
    strict?: boolean;
    extensions?: (string | ExtensionInfo)[];
};

export type ExtensionInfo = {
    path: string;
    options: Hash;
};
