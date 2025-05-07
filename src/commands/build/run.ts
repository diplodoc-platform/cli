import type {BuildConfig} from '.';

import {join, resolve} from 'node:path';
import {uniq} from 'lodash';
import transformer from '@diplodoc/transform/lib/md';
import {yfmlint} from '@diplodoc/yfmlint';

import {configPath} from '~/core/config';
import {ASSETS_FOLDER, YFM_CONFIG_FILENAME} from '~/constants';
import {Run as BaseRun} from '~/core/run';
import {VarsService} from '~/core/vars';
import {MetaService} from '~/core/meta';
import {TocService} from '~/core/toc';
import {VcsService} from '~/core/vcs';
import {LeadingService} from '~/core/leading';
import {MarkdownService} from '~/core/markdown';
import {all, bounded, langFromPath, normalizePath, zip} from '~/core/utils';

import {EntryService} from './services/entry';
import {SearchService} from './services/search';
import {getPublicPath} from '@diplodoc/transform/lib/utilsFS';
import {RedirectsService} from './services/redirects';

type TransformOptions = {
    deps: NormalizedPath[];
    assets: NormalizedPath[];
};

const TMP_INPUT_FOLDER = '.tmp_input';

const TMP_OUTPUT_FOLDER = '.tmp_output';

/**
 * This is transferable context for build command.
 * Use this context to communicate with lower data processing levels.
 */
export class Run extends BaseRun<BuildConfig> {
    readonly originalInput: AbsolutePath;

    readonly input: AbsolutePath;

    readonly originalOutput: AbsolutePath;

    readonly output: AbsolutePath;

    readonly vars: VarsService;

    readonly meta: MetaService;

    readonly toc: TocService;

    readonly entry: EntryService;

    readonly vcs: VcsService;

    readonly leading: LeadingService;

    readonly markdown: MarkdownService;

    readonly search: SearchService;

    readonly redirects: RedirectsService;

    get configPath() {
        return this.config[configPath] || join(this.config.input, YFM_CONFIG_FILENAME);
    }

    get bundlePath() {
        return join(this.output, '_bundle');
    }

    get assetsPath() {
        return join(ASSETS_FOLDER);
    }

    constructor(config: BuildConfig) {
        super(config);

        this.originalInput = config.input;
        this.originalOutput = config.output;
        this.input = resolve(config.output, TMP_INPUT_FOLDER);
        this.output = resolve(config.output, TMP_OUTPUT_FOLDER);

        // Sequence is important for scopes.
        // Otherwise logger will replace originalOutput instead of output.
        this.scopes.set('<assets>', this.assetsPath);
        this.scopes.set('<input>', this.input);
        this.scopes.set('<output>', this.output);
        this.scopes.set('<origin>', this.originalInput);
        this.scopes.set('<result>', this.originalOutput);

        this.vars = new VarsService(this);
        this.meta = new MetaService(this);
        this.toc = new TocService(this);
        this.entry = new EntryService(this);
        this.vcs = new VcsService(this);
        this.leading = new LeadingService(this);
        this.markdown = new MarkdownService(this);
        this.search = new SearchService(this);
        this.redirects = new RedirectsService(this);
    }

    async transform(file: NormalizedPath, markdown: string, options: TransformOptions) {
        const {deps, assets} = options;

        const {parse, compile, env} = transformer({
            ...this.transformConfig(file),
            files: await remap(deps, this.files),
            titles: await remap([file].concat(assets), this.titles),
            assets: await remap(assets, async (path) => {
                if (path.endsWith('.svg')) {
                    return this.read(join(this.input, path));
                } else {
                    return true;
                }
            }),
        });

        const tokens = parse(markdown);
        const result = compile(tokens);

        return [result, env] as const;
    }

    async lint(file: NormalizedPath, markdown: string, options: TransformOptions) {
        const {deps, assets} = options;
        const pluginOptions = {
            ...this.transformConfig(file),
            files: await remap(deps, this.files),
            titles: await remap([file].concat(assets), this.titles),
            assets: await remap(assets),
        };

        return yfmlint(markdown, file, {
            lintConfig: this.config.lint.config,
            pluginOptions,
            plugins: pluginOptions.plugins,
        });
    }

    private transformConfig(path: NormalizedPath) {
        return {
            allowHTML: this.config.allowHtml,
            needToSanitizeHtml: this.config.sanitizeHtml,
            supportGithubAnchors: Boolean(this.config.supportGithubAnchors),
            plugins: this.markdown.plugins,
            path,
            lang: langFromPath(path, this.config),
            getPublicPath,
            extractTitle: true,
            log: this.logger,
        };
    }

    @bounded
    private async files(path: NormalizedPath) {
        return this.markdown.load(path);
    }

    @bounded
    private async titles(path: NormalizedPath) {
        if (path.endsWith('/')) {
            path = this.exists(join(this.input, path, 'index.yaml'))
                ? join(path, 'index.yaml')
                : join(path, 'index.md');
        }

        if (path.match(/\/[^.]+?$/)) {
            path = normalizePath(path + '.md');
        }

        if (!path.endsWith('.md')) {
            return {};
        }

        return this.markdown.titles(path);
    }
}

async function remap<T>(
    infos: NormalizedPath[],
    map?: (path: NormalizedPath) => T,
): Promise<Record<NormalizedPath, T>> {
    const keys = uniq(infos);
    const values = map ? await all(keys.map(map)) : new Array(keys.length).fill(true);

    return zip<T>(keys, values);
}
