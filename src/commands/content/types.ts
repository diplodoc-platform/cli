import type {BuildArgs, BuildConfig} from '~/commands/build';

export type ContentArgs = BuildArgs & {
    input: AbsolutePath;
    output?: AbsolutePath;
    watch?: boolean;
};

export type ContentConfig = BuildConfig & {
    /** Target file path relative to the resolved project root. */
    file: NormalizedPath;
    /** Watch mode flag. */
    watch: boolean;
    /** User-specified output file (`-o`). When absent, the result goes to stdout. */
    outputFile?: AbsolutePath;
};
