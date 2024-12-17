import type {YfmArgv} from '~/models';
import type {BuildConfig} from '.';

import {ok} from 'node:assert';
import {dirname, join, relative, resolve} from 'node:path';
import {access, link, mkdir, readFile, realpath, stat, unlink, writeFile} from 'node:fs/promises';
import {glob} from 'glob';

import {normalizePath} from '~/utils';
import {configPath} from '~/config';
import {
    BUNDLE_FOLDER,
    REDIRECTS_FILENAME,
    TMP_INPUT_FOLDER,
    TMP_OUTPUT_FOLDER,
    YFM_CONFIG_FILENAME,
} from '~/constants';
import {LogLevel, Logger} from '~/logger';
import {legacyConfig} from './legacy-config';
import {InsecureAccessError} from './errors';
import {VarsService} from './core/vars';
import {addSourcePath} from './core/meta';

type FileSystem = {
    access: typeof access;
    stat: typeof stat;
    realpath: typeof realpath;
    link: typeof link;
    unlink: typeof unlink;
    mkdir: typeof mkdir;
    readFile: typeof readFile;
    writeFile: typeof writeFile;
};

type GlobOptions = {
    cwd?: AbsolutePath;
    ignore?: string[];
};

type CopyOptions = {
    ignore?: string[];
    sourcePath?: (path: string) => boolean;
};

class RunLogger extends Logger {
    proc = this.topic(LogLevel.INFO, 'PROC');
    copy = this.topic(LogLevel.INFO, 'COPY');
}

/**
 * This is transferable context for build command.
 * Use this context to communicate with lower data processing levels.
 */
export class Run {
    readonly originalInput: AbsolutePath;

    readonly originalOutput: AbsolutePath;

    readonly input: AbsolutePath;

    readonly output: AbsolutePath;

    readonly legacyConfig: YfmArgv;

    readonly logger: RunLogger;

    readonly config: BuildConfig;

    readonly fs: FileSystem = {access, stat, realpath, link, unlink, mkdir, readFile, writeFile};

    readonly vars: VarsService;

    get bundlePath() {
        return join(this.output, BUNDLE_FOLDER);
    }

    get configPath() {
        return this.config[configPath] || join(this.config.input, YFM_CONFIG_FILENAME);
    }

    get redirectsPath() {
        return join(this.originalInput, REDIRECTS_FILENAME);
    }

    private _copyMap: Record<AbsolutePath, AbsolutePath> = {};

    constructor(config: BuildConfig) {
        this.config = config;
        this.originalInput = config.input;
        this.originalOutput = config.output;

        // TODO: use root instead
        // We need to create system where we can safely work with original input.
        this.input = resolve(config.output, TMP_INPUT_FOLDER);
        this.output = resolve(config.output, TMP_OUTPUT_FOLDER);

        this.logger = new RunLogger(config, [
            (_level, message) => message.replace(new RegExp(this.input, 'ig'), ''),
        ]);

        this.vars = new VarsService(this);
        this.legacyConfig = legacyConfig(this);
    }

    /**
     * Run.input bounded read helper
     *
     * Asserts file path is in project scope.
     *
     * @throws {InsecureAccessError}
     * @param {AbsolutePath} path - unixlike absolute path to file
     *
     * @returns {Promise<string>}
     */
    read = async (path: AbsolutePath) => {
        this.assertProjectScope(path);

        return this.fs.readFile(path, 'utf8');
    };

    /**
     * Run.input bounded write helper.
     *
     * Asserts file path is in project scope.
     * Drops hardlinks (unlink before write).
     * Creates directory for file.
     *
     * @param {AbsolutePath} path - unixlike absolute path to file
     * @param {string} content - file content
     *
     * @returns {Promise<void>}
     */
    write = async (path: AbsolutePath, content: string) => {
        this.assertProjectScope(path);

        await this.fs.mkdir(dirname(path), {recursive: true});
        await this.fs.unlink(path).catch(() => {});
        await this.fs.writeFile(path, content, 'utf8');
    };

    glob = async (pattern: string | string[], options: GlobOptions): Promise<NormalizedPath[]> => {
        const paths = await glob(pattern, {
            dot: true,
            nodir: true,
            follow: true,
            ...options,
        });

        return paths.map(normalizePath);
    };

    copy = async (
        from: AbsolutePath,
        to: AbsolutePath,
        options: CopyOptions | CopyOptions['ignore'] = {},
    ) => {
        if (Array.isArray(options)) {
            options = {ignore: options};
        }

        const {ignore, sourcePath} = options;
        const isFile = (await this.fs.stat(from)).isFile();
        const hardlink = async (from: AbsolutePath, to: AbsolutePath) => {
            // const realpath = this.realpath(from);
            //
            // ok(
            //     realpath[0].startsWith(this.originalInput),
            //     new InsecureAccessError(realpath[0], realpath),
            // );

            await this.fs.unlink(to).catch(() => {});
            await this.fs.link(from, to);
            this._copyMap[to] = from;
        };

        if (isFile) {
            await this.fs.mkdir(dirname(to), {recursive: true});
            await hardlink(from, to);

            return;
        }

        const dirs = new Set();
        const files = (await this.glob('**', {
            cwd: from,
            ignore,
        })) as RelativePath[];

        for (const file of files) {
            const dir = join(to, dirname(file));
            if (!dirs.has(dir)) {
                await this.fs.mkdir(dir, {recursive: true});
                dirs.add(dir);
            }

            this.logger.copy(join(from, file), join(to, file));

            if (sourcePath) {
                const content = await this.read(join(from, file));
                this.write(
                    join(to, file),
                    addSourcePath(content, relative(this.input, join(from, file))),
                );
            } else {
                await hardlink(join(from, file), join(to, file));
            }
        }
    };

    realpath = async (path: AbsolutePath): Promise<AbsolutePath[]> => {
        const stack = [path];
        while (this._copyMap[path]) {
            path = this._copyMap[path];
            stack.unshift(path);
        }

        try {
            const realpath = await this.fs.realpath(stack[0]);

            if (realpath !== stack[0]) {
                stack.unshift(realpath);
            }
        } catch {}

        return stack;
    };

    private async assertProjectScope(path: AbsolutePath) {
        const realpath = await this.realpath(path);
        const isInScope =
            realpath[0].startsWith(this.originalInput) ||
            realpath[0].startsWith(this.originalOutput) ||
            realpath[0].startsWith(this.input) ||
            realpath[0].startsWith(this.output);
        ok(isInScope, new InsecureAccessError(path, realpath));
    }
}
