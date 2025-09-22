import type {Config} from '~/core/config';
import type {BaseConfig} from '~/core/program';
import type {FileSystem} from './fs';

import {ok} from 'node:assert';
import {dirname, join} from 'node:path';
import {constants as fsConstants} from 'node:fs/promises';
import {glob} from 'glob';
import pmap from 'p-map';

import {bounded, normalizePath, wait} from '~/core/utils';
import {LogLevel, Logger} from '~/core/logger';

import {InsecureAccessError} from './errors';
import {fs} from './fs';

type GlobOptions = {
    cwd?: AbsolutePath;
    ignore?: string[];
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

    constructor(config: Config<BaseConfig & TConfig>) {
        this.config = config;
        this.input = config.input;
        this.originalInput = config.input;
        this.logger = new RunLogger(config, [
            (_level, message) => {
                for (const [alias, scope] of this.scopes.entries()) {
                    const clean = message.replace(new RegExp(scope, 'ig'), alias);

                    if (clean === alias) {
                        return message;
                    }

                    message = clean;
                }

                return message;
            },
        ]);
    }

    /**
     * This method is especially written in sync mode to use in run.write method.
     */
    @bounded exists(path: AbsolutePath) {
        try {
            this.fs.statSync(path);
            return true;
        } catch {
            return false;
        }
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
        await this.assertProjectScope(path);

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
     * @param {boolean} force - ignore file exists
     *
     * @returns {Promise<void>}
     */
    @bounded async write(path: AbsolutePath, content: string, force = false) {
        await this.assertProjectScope(path);

        // Move write to next task instead of process it in current microtask.
        // This allow to detect already created files in parallel processing.
        await wait(1);

        // Sync exists check can detect created file as fast as possible.
        if (this.exists(path) && !force) {
            return;
        }

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

    @bounded async copy(from: AbsolutePath, to: AbsolutePath, ignore: string[] = []) {
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
        };

        if (from === to) {
            return [];
        }

        const dirs = new Set();
        const files = isFile
            ? [[from, to]]
            : (
                  await this.glob('**', {
                      cwd: from,
                      ignore,
                  })
              ).map((file) => [join(from, file), join(to, file)]);

        await pmap(files, async ([from, to]) => {
            const dir = dirname(to);
            if (!dirs.has(dir)) {
                await this.fs.mkdir(dir, {recursive: true});
                dirs.add(dir);
            }

            await hardlink(from, to);
        });

        return files;
    }

    /**
     * Remove selected file or directory.
     */
    @bounded async remove(path: AbsolutePath): Promise<void> {
        try {
            await this.fs.rm(path, {recursive: true, force: true});
        } catch {}
    }

    @bounded async realpath(path: AbsolutePath) {
        try {
            return await this.fs.realpath(path);
        } catch {
            return path;
        }
    }

    private async assertProjectScope(path: AbsolutePath) {
        const scopes = [...this.scopes.values()].map(normalizePath) as AbsolutePath[];
        const realpath = normalizePath(await this.realpath(path)) as AbsolutePath;
        const isInScope = scopes.some((scope) => realpath.startsWith(scope));
        ok(isInScope, new InsecureAccessError(path, realpath, scopes));
    }
}
