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
    jobs?: number;
    extensions?: (string | ExtensionInfo)[];
    preprocess?: Hash<string>;
};

export type ExtensionInfo<Options extends Hash = Hash> = {
    name: string;
} & Options;

export type Report = {
    code: number;
} & Hash;
