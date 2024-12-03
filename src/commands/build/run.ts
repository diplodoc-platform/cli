import type {YfmArgv} from '~/models';
import type {GlobOptions} from 'glob';

// import {ok} from 'node:assert';
import {dirname, join, resolve} from 'node:path';
import {access, link, mkdir, readFile, stat, unlink, writeFile} from 'node:fs/promises';
import {glob} from 'glob';

import {configPath} from '~/config';
import {
    BUNDLE_FOLDER,
    REDIRECTS_FILENAME,
    TMP_INPUT_FOLDER,
    TMP_OUTPUT_FOLDER,
    YFM_CONFIG_FILENAME,
} from '~/constants';
import {LogLevel, Logger} from '~/logger';
import {BuildConfig} from '.';
// import {InsecureAccessError} from './errors';
import {VarsService} from './core/vars';

type FileSystem = {
    access: typeof access;
    stat: typeof stat;
    link: typeof link;
    unlink: typeof unlink;
    mkdir: typeof mkdir;
    readFile: typeof readFile;
    writeFile: typeof writeFile;
};

class RunLogger extends Logger {
    proc = this.topic(LogLevel.INFO, 'PROC');
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

    readonly fs: FileSystem = {access, stat, link, unlink, mkdir, readFile, writeFile};

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
        this.legacyConfig = {
            rootInput: this.originalInput,
            input: this.input,
            output: this.output,
            quiet: config.quiet,
            addSystemMeta: config.addSystemMeta,
            addMapFile: config.addMapFile,
            staticContent: config.staticContent,
            strict: config.strict,
            langs: config.langs,
            lang: config.lang,
            ignoreStage: config.ignoreStage,
            singlePage: config.singlePage,
            removeHiddenTocItems: config.removeHiddenTocItems,
            allowCustomResources: config.allowCustomResources,
            resources: config.resources,
            analytics: config.analytics,
            varsPreset: config.varsPreset,
            vars: config.vars,
            outputFormat: config.outputFormat,
            allowHTML: config.allowHtml,
            needToSanitizeHtml: config.sanitizeHtml,
            useLegacyConditions: config.useLegacyConditions,

            ignore: config.ignore,

            applyPresets: config.template.features.substitutions,
            resolveConditions: config.template.features.conditions,
            conditionsInCode: config.template.scopes.code,
            disableLiquid: !config.template.enabled,

            buildDisabled: config.buildDisabled,

            lintDisabled: !config.lint.enabled,
            // @ts-ignore
            lintConfig: config.lint.config,

            vcs: config.vcs,
            connector: config.vcs.connector,
            contributors: config.contributors,
            ignoreAuthorPatterns: config.ignoreAuthorPatterns,

            changelogs: config.changelogs,
            search: config.search,

            included: config.mergeIncludes,
        };
    }

    write = async (path: AbsolutePath, content: string | Buffer) => {
        await this.fs.mkdir(dirname(path), {recursive: true});
        await this.fs.unlink(path).catch(() => {});
        await this.fs.writeFile(path, content, 'utf8');
    };

    glob = async (pattern: string | string[], options: GlobOptions) => {
        return glob(pattern, {
            dot: true,
            nodir: true,
            follow: true,
            ...options,
        });
    };

    copy = async (from: AbsolutePath, to: AbsolutePath, ignore?: string[]) => {
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

            await hardlink(join(from, file), join(to, file));
        }
    };

    realpath = (path: AbsolutePath): AbsolutePath[] => {
        const stack = [path];
        while (this._copyMap[path]) {
            path = this._copyMap[path];
            stack.unshift(path);
        }

        return stack;
    };
}
