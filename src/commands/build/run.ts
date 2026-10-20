import type {BuildConfig, Langs} from '.';
import type {AssetInfo, IncludeInfo} from '~/core/markdown';
import type {Alternate} from '~/core/meta';
import type {Lang} from '@diplodoc/transform/lib/typings';

import {dirname, join, relative, resolve} from 'node:path';
import {uniq} from 'lodash';
import transformer from '@diplodoc/transform/lib/md';
import {getPublicPath} from '@diplodoc/transform/lib/utilsFS';
import {createIDGeneratorByStrategy} from '@diplodoc/utils';

import {configPath} from '~/core/config';
import {ASSETS_FOLDER, YFM_CONFIG_FILENAME} from '~/constants';
import {Run as BaseRun} from '~/core/run';
import {VarsService} from '~/core/vars';
import {MetaService} from '~/core/meta';
import {TocService} from '~/core/toc';
import {VcsService} from '~/core/vcs';
import {LeadingService, getHooks as getLeadingHooks} from '~/core/leading';
import {MarkdownService} from '~/core/markdown';
import {
    all,
    bounded,
    get,
    isSubPath,
    langFromPath,
    memoize,
    normalizePath,
    setExt,
    zip,
} from '~/core/utils';

import {RedirectsService} from './services/redirects';
import {SearchService} from './services/search';
import {EntryService} from './services/entry';
import {AnchorsService, collectAnchorIds} from './services/anchors';
import {HtmlResources} from './services/html-resources';
import {extractIncludedBlocks} from './extract-included';
import {lintWithLocalAnchors} from './lint';
import {HIGHLIGHT_STYLES_ROOT} from './features/themer/constants';

type TransformOptions = {
    deps: IncludeInfo[];
    assets: AssetInfo[];
    anchorIds?: Set<string>;
    reportErrors?: boolean;
};

type Manifest = Hash<{
    js: string[];
    css: string[];
    async: string[];
}>;

const TMP_INPUT_FOLDER = '.tmp_input';

export type TransformConfig = ReturnType<Run['transformConfig']>;

/**
 * This is transferable context for build command.
 * Use this context to communicate with lower data processing levels.
 */
export class Run extends BaseRun<BuildConfig> {
    readonly originalInput: AbsolutePath;

    readonly input: AbsolutePath;

    readonly output: AbsolutePath;

    readonly highlightStylesPath: AbsolutePath;

    readonly vars: VarsService;

    readonly meta: MetaService;

    readonly toc: TocService;

    readonly entry: EntryService;

    readonly vcs: VcsService;

    readonly leading: LeadingService;

    readonly markdown: MarkdownService;

    readonly search: SearchService;

    readonly redirects: RedirectsService;

    private readonly anchors: AnchorsService;

    private entriesCache?: {index: ReadonlySet<NormalizedPath>; paths: NormalizedPath[]};

    private htmlResources?: HtmlResources;

    get configPath() {
        return this.config[configPath] || join(this.config.input, YFM_CONFIG_FILENAME);
    }

    get bundlePath() {
        return join(this.output, '_bundle');
    }

    get assetsPath() {
        return join(ASSETS_FOLDER);
    }

    get manifest() {
        return require(join(__dirname, 'manifest.json')) as Manifest;
    }

    constructor(config: BuildConfig, options: {selective?: boolean} = {}) {
        super(config);

        this.originalInput = this.realpathSync(config.input);
        this.output = this.realpathSync(config.output);
        this.highlightStylesPath = this.realpathSync(HIGHLIGHT_STYLES_ROOT as AbsolutePath);
        this.input = config.originAsInput
            ? this.originalInput
            : resolve(this.output, TMP_INPUT_FOLDER);

        if (options.selective) {
            if (this.input === this.originalInput) {
                throw new Error('Selective source processing requires a separate build workspace');
            }
            const ignore = ['node_modules/**', '*/node_modules/**'];
            if (isSubPath(this.originalInput, this.output)) {
                ignore.push(`${relative(this.originalInput, this.output)}/**`);
            }
            this.sources.configure(this.originalInput, this.input, ignore);
        }

        // Sequence is important for scopes.
        // Otherwise logger will replace originalOutput instead of output.
        this.scopes.set('<assets>', this.assetsPath);
        this.scopes.set('<input>', this.input);
        this.scopes.set('<output>', this.output);
        this.scopes.set('<origin>', this.originalInput);
        this.scopes.set('<highlight-styles>', this.highlightStylesPath);

        this.vars = new VarsService(this);
        this.meta = new MetaService(this);
        this.toc = new TocService(this, {pdfDebug: this.config.pdfDebug});
        this.entry = new EntryService(this);
        this.vcs = new VcsService(this);
        this.leading = new LeadingService(this);
        this.markdown = new MarkdownService(this);
        this.anchors = new AnchorsService(this);
        this.search = new SearchService(this);
        this.redirects = new RedirectsService(this);
        if (this.sources.active && this.config.outputFormat === 'html') {
            this.htmlResources = new HtmlResources(this, this.collectResource, (message) => {
                throw new Error(message);
            });
            getLeadingHooks(this.leading).Loaded.tapPromise(
                {name: 'HtmlSourceResources', stage: Infinity},
                async (leading, _meta, path) => {
                    if (leading.blocks) {
                        return;
                    }
                    for (const value of [leading.title].concat(leading.description || [])) {
                        await this.htmlResources?.collect(value, path);
                    }
                },
            );
        }
    }

    async transform(file: NormalizedPath, markdown: string, options: TransformOptions) {
        const {deps, assets, anchorIds, reportErrors = true} = options;

        const {
            content: cleanMarkdown,
            files: includedFiles,
            errors,
        } = extractIncludedBlocks(markdown, file);
        if (reportErrors) {
            for (const error of errors) {
                this.logger.error(error);
            }
        }

        const titles = uniq([file].concat(assets.filter(needAutotitle).map(get('path'))));
        const assetsRemap = await remap(assets.map(get('path')), async (path) => {
            if (path?.endsWith('.svg')) {
                return this.read(normalizePath(join(this.input, path)) as AbsolutePath);
            } else {
                return true;
            }
        });

        const depFiles = await remap(deps.map(get('path')), (path) => {
            const embedded = includedFiles[path];
            if (typeof embedded === 'string') {
                return embedded;
            }
            return this.files(path, file);
        });

        const {parse, compile, env} = transformer({
            ...this.transformConfig(file, assetsRemap),
            files: {...depFiles, ...includedFiles},
            titles: await remap(titles, this.titles),
            assets: assetsRemap,
        });

        const result = compile(parse(cleanMarkdown));
        await this.htmlResources?.collect(result, file);
        if (anchorIds) {
            collectAnchorIds(result, anchorIds);
        }

        return [result, env] as const;
    }

    /** Collect selected native assets after services and output hooks have resolved their graphs. */
    async collectDependencies() {
        if (!this.sources.active) {
            return;
        }
        for (const path of this.toc.entries) {
            // A copied page keeps its native source metadata after a hook replaces its content.
            const source = this.toc.sourceDependency(path);
            if (source) {
                await this.depend(source);
            }
            const service = path.endsWith('.md') ? this.markdown : this.leading;
            const graph = await service.relations(path);
            for (const node of graph.overallOrder()) {
                if (
                    graph.getNodeData(node)?.type === 'resource' &&
                    !/^(?:[a-z]+:|\/\/|#)/i.test(node)
                ) {
                    await this.collectResource(join(this.input, node));
                }
            }
            for (const asset of await service.assets(path)) {
                if (asset.path && !/^(?:[a-z]+:|\/\/|#)/i.test(asset.path)) {
                    await this.collectResource(join(this.input, asset.path));
                }
            }
        }
    }

    async lint(
        file: NormalizedPath,
        markdown: string,
        options: TransformOptions,
        plugins = this.markdown.plugins,
    ) {
        const {deps, assets} = options;

        const {
            content: cleanMarkdown,
            files: includedFiles,
            errors,
        } = extractIncludedBlocks(markdown, file);
        for (const error of errors) {
            this.logger.error(error);
        }

        const titles = uniq([file].concat(assets.filter(needAutotitle).map(get('path'))));
        const assetsRemap = await remap(assets.map(get('path')), async (path) => {
            if (path?.endsWith('.svg')) {
                return this.read(normalizePath(join(this.input, path)) as AbsolutePath);
            } else {
                return true;
            }
        });

        const depFiles = await remap(deps.map(get('path')), (path) => {
            const embedded = includedFiles[path];
            if (typeof embedded === 'string') {
                return embedded;
            }
            return this.files(path, file);
        });

        const pluginOptions = {
            ...this.transformConfig(file, assetsRemap),
            plugins,
            files: {...depFiles, ...includedFiles},
            titles: await remap(titles, this.titles),
            anchorIndex: await this.anchors.index(file, assets),
            assets: assetsRemap,
        };

        return lintWithLocalAnchors(cleanMarkdown, file, {
            lintConfig: this.config.lint.config,
            pluginOptions,
            plugins,
        });
    }

    alternates(file: NormalizedPath) {
        const langs = this.config.langs;
        const alternates = this.getAlternateMap();
        const [lang, base] = extractLang(file, langs);

        if (!lang) {
            return [];
        }

        return alternates[base] || [];
    }

    private transformConfig(path: NormalizedPath, assets: Record<string, unknown>) {
        const generateID = createIDGeneratorByStrategy(this.config.idGenerator);

        return {
            allowHTML: this.config.allowHtml,
            needToSanitizeHtml: this.config.sanitizeHtml,
            breaks: this.config.breaks,
            linkify: this.config.linkify,
            linkifyTlds: this.config.linkifyTlds,
            supportGithubAnchors: Boolean(this.config.supportGithubAnchors),
            plugins: this.markdown.plugins,
            path,
            lang: langFromPath(path, this.config) as Lang,
            getPublicPath,
            extractTitle: true,
            log: this.logger,
            entries: this.getEntries(),
            entrySet: this.toc.entrySet,
            existsInProject: this.existsInProject,
            resolveAnchorPage: this.anchors.resolve,
            ...(this.config.content.svgMaxEntityCount === undefined
                ? {}
                : {svgMaxEntityCount: this.config.content.svgMaxEntityCount}),
            svgInline: {
                enabled: this.config.content.maxInlineSvgSize !== 0,
                maxFileSize: this.config.content.maxInlineSvgSize,
            },
            gallery: this.config.interface?.gallery,
            multilineTermDefinitions:
                this.config.content.multilineTermDefinitions ??
                this.config.multilineTermDefinitions,
            generateID,
            codeLineWrapping: this.config.codeLineWrapping ?? true,
            rawContent: (path: string): string => {
                const asset = assets[path];
                if (typeof asset !== 'string') {
                    throw new Error('Asset not found');
                }

                return asset;
            },
            calcPath: (root: string, path: string) => normalizePath(join(dirname(root), path)),
            replaceImageSrc: (_state: unknown, _root: string, file: string) => file,
        };
    }

    private getEntries() {
        const index = this.toc.entrySet;
        if (this.entriesCache?.index !== index) {
            this.entriesCache = {index, paths: [...index]};
        }
        return this.entriesCache.paths;
    }

    @memoize()
    private getAlternateMap() {
        const map: Hash<Alternate[]> = {};
        const langs = this.config.langs;
        const entries = this.getEntries();

        for (const entry of entries) {
            const [hreflang, base] = extractLang(entry, langs);
            const href = setExt(entry, 'html');

            if (hreflang) {
                map[base] = map[base] || [];
                map[base].push({href, hreflang});
            }
        }

        return map;
    }

    @bounded private async collectResource(path: string) {
        if (!this.sources.isWorkspacePath(path)) {
            return;
        }
        if (!this.exists(path as AbsolutePath) || !this.statSync(path as AbsolutePath).isFile()) {
            return;
        }
        if (this.config.outputFormat === 'html' && !/\.(?:md|ya?ml)$/i.test(path)) {
            await this.copy(path as AbsolutePath, join(this.output, relative(this.input, path)));
        }
    }

    @bounded
    private existsInProject(path: NormalizedPath) {
        return this.exists(join(this.input, path));
    }

    @bounded
    private async files(path: NormalizedPath, from?: NormalizedPath) {
        return this.markdown.load(path, from);
    }

    @bounded
    private async titles(path: NormalizedPath) {
        if (path?.endsWith('/')) {
            path = this.exists(join(this.input, path, 'index.yaml'))
                ? join(path, 'index.yaml')
                : join(path, 'index.md');
        }

        if (path?.match(/\/[^.]+?$/)) {
            path = normalizePath(path + '.md');
        }

        if (path === null || !path?.endsWith('.md')) {
            return {};
        }

        return this.markdown.titles(path);
    }
}

function extractLang(file: NormalizedPath, langs: Langs) {
    const [lang, ...rest] = file.split('/');

    const matched = langs.find((l) => {
        if (typeof l === 'string') {
            return l === lang;
        } else if (l && typeof l === 'object' && 'lang' in l) {
            return l.lang === lang;
        }

        return false;
    });

    if (!matched) {
        return [];
    }

    return [lang, rest.join('/')];
}

function needAutotitle(asset: AssetInfo) {
    return asset.autotitle;
}

async function remap<T>(
    infos: NormalizedPath[],
    map?: (path: NormalizedPath) => T,
): Promise<Record<NormalizedPath, T>> {
    const keys = uniq(infos);
    const values = map ? await all(keys.map(map)) : new Array(keys.length).fill(true);

    return zip<T>(keys, values);
}
