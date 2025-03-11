import type {Config} from '~/core/config';
import type {BaseConfig} from '~/core/program';
import type {FileSystem} from './fs';

import {ok} from 'node:assert';
import {dirname, join, relative} from 'node:path';
import {constants as fsConstants} from 'node:fs/promises';
import {glob} from 'glob';

import {bounded, normalizePath} from '~/core/utils';
import {LogLevel, Logger} from '~/core/logger';
import {addSourcePath} from '~/core/meta';

import {InsecureAccessError} from './errors';

import {fs} from './fs';

type GlobOptions = {
    cwd?: AbsolutePath;
    ignore?: string[];
};

type CopyOptions = {
    ignore?: string[];
    sourcePath?: (path: string) => boolean;
};

export class RunLogger extends Logger {
    proc = this.topic(LogLevel.INFO, 'PROC');
    copy = this.topic(LogLevel.INFO, 'COPY');
}

/**
 * This is transferable context for build command.
 * Use this context to communicate with lower data processing levels.
 */
export class Run<TConfig = BaseConfig> {
    readonly logger: RunLogger;

    readonly config: Config<BaseConfig & TConfig>;

    readonly fs: FileSystem = fs;

    readonly normalize: (path: RelativePath) => NormalizedPath = normalizePath;

    readonly input: AbsolutePath;

    readonly originalInput: AbsolutePath;

    protected scopes: Map<string, AbsolutePath> = new Map();

    private _copyMap: Record<AbsolutePath, AbsolutePath> = {};

    constructor(config: Config<BaseConfig & TConfig>) {
        this.config = config;
        this.input = config.input;
        this.originalInput = config.input;
        this.logger = new RunLogger(config, [
            (_level, message) => {
                for (const [alias, scope] of this.scopes.entries()) {
                    message = message.replace(new RegExp(scope, 'ig'), alias);
                }

                return message;
            },
        ]);
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
    @bounded async read(path: AbsolutePath) {
        this.assertProjectScope(path);

        return this.fs.readFile(path, 'utf8');
    }

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
    @bounded async write(path: AbsolutePath, content: string) {
        this.assertProjectScope(path);

        await this.fs.mkdir(dirname(path), {recursive: true});
        await this.fs.unlink(path).catch(() => {});
        await this.fs.writeFile(path, content, 'utf8');
    }

    /**
     * Glob wrapper with some default settings
     *
     * @param {string | string[]} pattern
     * @param {GlobOptions} options
     *
     * @returns {NormalizedPath[]}
     */
    @bounded async glob(
        pattern: string | string[],
        options: GlobOptions,
    ): Promise<NormalizedPath[]> {
        const paths = await glob(pattern, {
            dot: true,
            nodir: true,
            follow: true,
            ...options,
        });

        return paths.map(normalizePath);
    }

    @bounded async copy(
        from: AbsolutePath,
        to: AbsolutePath,
        options: CopyOptions | CopyOptions['ignore'] = {},
    ) {
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
            await this.fs.copyFile(from, to, fsConstants.COPYFILE_FICLONE);

            this._copyMap[to] = from;
        };

        if (from === to) {
            return;
        }

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

            // this.logger.copy(join(from, file), join(to, file));

            if (sourcePath && sourcePath(file)) {
                const content = await this.read(join(from, file));
                await this.write(
                    join(to, file),
                    addSourcePath(content, relative(this.input, join(from, file))),
                );
            } else {
                await hardlink(join(from, file), join(to, file));
            }
        }
    }

    /**
     * Remove selected file or directory.
     */
    @bounded async remove(path: AbsolutePath): Promise<void> {
        try {
            await this.fs.rm(path, {recursive: true, force: true});
        } catch {}
    }

    realpath(path: AbsolutePath): Promise<AbsolutePath[]>;
    realpath(path: AbsolutePath, withStack: true): Promise<AbsolutePath[]>;
    realpath(path: AbsolutePath, withStack: false): Promise<AbsolutePath>;
    @bounded async realpath(path: AbsolutePath, withStack = true) {
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

        return withStack ? stack : stack[0];
    }

    private async assertProjectScope(path: AbsolutePath) {
        const realpath = await this.realpath(path);
        const isInScope = [...this.scopes.values()].some((scope) => realpath[0].startsWith(scope));
        ok(isInScope, new InsecureAccessError(path, realpath));
    }
}
