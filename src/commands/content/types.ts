import type {BuildArgs, BuildConfig} from '~/commands/build';

export type ContentArgs = BuildArgs & {
    input: AbsolutePath;
    output?: AbsolutePath;
    watch?: boolean;
    raw?: boolean;
};

export type ContentConfig = BuildConfig & {
    /** Target file path relative to the resolved project root. */
    file: NormalizedPath;
    /** Watch mode flag. */
    watch: boolean;
    /** User-specified output file (`-o`). When absent, the result goes to stdout. */
    outputFile?: AbsolutePath;
    /**
     * Raw stdout mode. When `true`, the content is printed to stdout as-is,
     * without the start/end delimiter markers and without framework banners
     * (version line, build timer, completion banner). Defaults to `false`.
     */
    raw: boolean;
};
