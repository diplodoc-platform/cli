import type {BuildArgs, BuildConfig} from '~/commands/build';

export type PrepareArgs = BuildArgs & {dryRun?: boolean};
export type PrepareConfig = BuildConfig & {dryRun?: boolean};

export type PrepareResult = {
    files: number;
    output: string;
    input: string;
    config?: string;
    extensions: {name: string; local: boolean}[];
};
