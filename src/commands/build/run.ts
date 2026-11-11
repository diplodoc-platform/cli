import type {BuildConfig, Langs} from '.';
import type {AssetInfo, IncludeInfo} from '~/core/markdown';
import type {Alternate} from '~/core/meta';
import type {Lang} from '@diplodoc/transform/lib/typings';

import {dirname, join, resolve} from 'node:path';
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
import {LeadingService} from '~/core/leading';
import {MarkdownService} from '~/core/markdown';
import {all, bounded, get, langFromPath, memoize, normalizePath, setExt, zip} from '~/core/utils';

import {RedirectsService} from './services/redirects';
import {SearchService} from './services/search';
import {EntryService} from './services/entry';
import {AnchorsService, collectAnchorIds} from './services/anchors';
import {AnchorRenderCache} from './services/anchors/RenderCache';
import {extractIncludedBlocks} from './extract-included';
import {getLocalAnchorRuleConfig, lintWithLocalAnchors} from './lint';
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

    private readonly anchorRenders = new AnchorRenderCache<ReturnType<typeof transformer>['env']>();

    private entriesCache?: {index: ReadonlySet<NormalizedPath>; paths: NormalizedPath[]};

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

    constructor(config: BuildConfig) {
        super(config);

        this.originalInput = this.realpathSync(config.input);
        this.output = this.realpathSync(config.output);
        this.highlightStylesPath = this.realpathSync(HIGHLIGHT_STYLES_ROOT as AbsolutePath);
        this.input = config.originAsInput
            ? this.originalInput
            : resolve(this.output, TMP_INPUT_FOLDER);

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
    }

    async transform(file: NormalizedPath, markdown: string, options: TransformOptions) {
        return this.render(file, markdown, options, false);
    }

    async collectAnchors(
        file: NormalizedPath,
        markdown: string,
        options: TransformOptions,
    ): Promise<ReadonlySet<string>> {
        const anchorIds = new Set<string>();
        await this.render(file, markdown, {...options, anchorIds, reportErrors: false}, true);

        return anchorIds;
    }

    async lint(
        file: NormalizedPath,
        markdown: string,
        options: TransformOptions,
        plugins = this.markdown.plugins,
    ) {
        const {source, assets, pluginOptions} = await this.prepareTransform(
            file,
            markdown,
            options,
        );
        const lintOptions = {
            ...pluginOptions,
            plugins,
            anchorIndex:
                getLocalAnchorRuleConfig(this.config.lint.config) === false
                    ? undefined
                    : await this.anchors.index(file, assets),
        };

        return lintWithLocalAnchors(source, file, {
            lintConfig: this.config.lint.config,
            pluginOptions: lintOptions,
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

    private async render(
        file: NormalizedPath,
        markdown: string,
        options: TransformOptions,
        forAnchors: boolean,
    ) {
        const revision = this.markdown.revision;
        const {anchorIds, reportErrors = true} = options;
        const {source, pluginOptions: transformOptions} = await this.prepareTransform(
            file,
            markdown,
            options,
            reportErrors,
        );
        this.anchorRenders.reset(this.markdown.revision);
        const signature =
            this.config.outputFormat !== 'md' &&
            revision === this.markdown.revision &&
            (forAnchors || this.anchorRenders.size)
                ? this.anchorRenders.signature(source, transformOptions, this.config.idGenerator)
                : undefined;
        const cached = !forAnchors && signature ? this.anchorRenders.take(signature) : undefined;
        if (cached) {
            if (anchorIds) {
                collectAnchorIds(cached[0], anchorIds);
            }

            return cached;
        }

        const {parse, compile, env} = transformer(transformOptions);

        const result = compile(parse(source));
        if (anchorIds) {
            collectAnchorIds(result, anchorIds);
        }

        const output = [result, env] as const;
        if (forAnchors && signature && revision === this.markdown.revision) {
            this.anchorRenders.set(signature, output);
        }

        return output;
    }

    private async prepareTransform(
        file: NormalizedPath,
        markdown: string,
        options: TransformOptions,
        reportErrors = true,
    ) {
        const {deps} = options;
        const assets = [...options.assets, ...this.markdown.embeddedAssets(file, markdown, deps)];

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

        const transformOptions = {
            ...this.transformConfig(file, assetsRemap),
            files: {...depFiles, ...includedFiles},
            titles: await remap(titles, this.titles),
            assets: assetsRemap,
        };
        return {source: cleanMarkdown, assets, pluginOptions: transformOptions};
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
