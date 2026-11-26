import type {BuildConfig, Langs} from '.';
import type {AssetInfo, IncludeInfo} from '~/core/markdown';
import type {Alternate} from '~/core/meta';
import type {DocumentEnv, Lang} from '@diplodoc/transform/types';

import {basename, dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {uniq} from 'lodash';
import {yfmlint} from '@diplodoc/yfmlint';
import transformer from '@diplodoc/transform/parser';
import {getPublicPath} from '@diplodoc/transform/utils/fs';
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

import {highlighter} from '../../core/markdown/highlighter';

import {RedirectsService} from './services/redirects';
import {SearchService} from './services/search';
import {EntryService} from './services/entry';
import {AnchorsService, collectAnchorIds} from './services/anchors';
import {AnchorRenderCache} from './services/anchors/RenderCache';
import {extractIncludedBlocks} from './extract-included';
import {getLocalAnchorRuleConfig, lintWithLocalAnchors} from './lint';
import {findAgentPageLinks} from './page-audience-links';
import {getPageLinkPlugins} from './features/output-html/utils';
import {HIGHLIGHT_STYLES_ROOT} from './features/themer/constants';
import {configureTransform} from './transform-configuration';
import {inspectFootnoteSyntax, inspectMergeSourceSyntax} from './footnote-inspection';

type TransformOptions = {
    deps: IncludeInfo[];
    assets: AssetInfo[];
    anchorIds?: Set<string>;
    reportErrors?: boolean;
    pageDiagnostics?: boolean;
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

    private readonly anchorRenders = new AnchorRenderCache<DocumentEnv>();

    private readonly agentPageLinks = new WeakMap<object, ReadonlySet<NormalizedPath>>();

    private entriesCache?: {index: ReadonlySet<NormalizedPath>; paths: NormalizedPath[]};

    private readonly titlesCache = new Map<NormalizedPath, Promise<Hash<string>>>();

    private titlesRevision = -1;

    private seenPageDeprecations?: Set<string>;

    private readonly pageLog: typeof this.logger;

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

    constructor(config: BuildConfig, sendPageDeprecation?: (message: string) => void) {
        super(config);
        this.pageLog = createPageLogger(
            this.logger,
            sendPageDeprecation ?? ((message) => this.reportPageDeprecation(message)),
        );

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

    /** Removes previously generated files, keeping watch cleanup inside the output directory. */
    async removeOutputFiles(paths: ReadonlySet<NormalizedPath>): Promise<void> {
        if (!paths.size) {
            return;
        }

        const root = await this.realpath(this.output);
        const directories = new Map<string, AbsolutePath>();
        for (const path of paths) {
            const directory = dirname(join(root, path));
            const resolved = directories.get(directory) || (await this.realpath(directory));
            directories.set(directory, resolved);
            const file = join(resolved, basename(path));
            const fromRoot = relative(root, file);
            if (!fromRoot || fromRoot.split(sep, 1)[0] === '..' || isAbsolute(fromRoot)) {
                throw new Error(`Page output outside the build directory: ${path}`);
            }
            await this.fs.rm(file, {force: true});
        }
    }

    reportPageDeprecation(message: string) {
        if (!this.logger.deprecationWarnings) {
            return;
        }
        this.seenPageDeprecations ??= new Set();
        if (!this.seenPageDeprecations.has(message)) {
            this.seenPageDeprecations.add(message);
            this.logger.deprecation(message);
        }
    }

    resetPageDeprecations() {
        this.seenPageDeprecations = undefined;
    }

    async transform(file: NormalizedPath, markdown: string, options: TransformOptions) {
        return this.render(file, markdown, options, false);
    }

    /** Check the human token stream without rendering or loading the linked documents and assets. */
    async checkMarkdownPageLinks(file: NormalizedPath, markdown: string, deps: IncludeInfo[]) {
        const {content, files} = await this.transformSource(file, markdown, deps);
        const parser = transformer(
            configureTransform({
                ...this.transformConfig(file, {}),
                files,
                extractTitle: false,
                plugins: this.markdown.plugins.concat(getPageLinkPlugins()),
            }),
        );
        const {tokens} = parser.parseDocument(content);
        const targets = findAgentPageLinks(tokens, (path) => this.toc.audience(path), file);
        this.reportAgentPageLinks(file, targets);
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

    /** Inspect source grammar without rendering or mutating the active document. */
    inspectFootnotes(source: string, path: NormalizedPath): boolean {
        return inspectFootnoteSyntax(source, this.transformConfig(path, {}));
    }

    /** Reuse the single canonical inspection for all Markdown merge decisions. */
    inspectMergeSource(source: string, path: NormalizedPath) {
        return inspectMergeSourceSyntax(source, this.transformConfig(path, {}));
    }

    async lint(
        file: NormalizedPath,
        markdown: string,
        options: TransformOptions & {prepareLinks?: boolean},
        plugins = this.markdown.plugins,
    ): ReturnType<typeof lintWithLocalAnchors> {
        const {prepareLinks = true} = options;
        const {source, assets, pluginOptions} = await this.prepareTransform(
            file,
            markdown,
            options,
            true,
            prepareLinks,
        );
        const lintOptions = {
            ...pluginOptions,
            plugins,
            anchorIndex:
                !prepareLinks || getLocalAnchorRuleConfig(this.config.lint.config) === false
                    ? undefined
                    : await this.anchors.index(file, assets),
        };

        if (!prepareLinks) {
            return yfmlint(source, file, {
                lintConfig: this.config.lint.config,
                enableMarkdownAttrs: pluginOptions.enableMarkdownAttrs,
                pluginOptions: lintOptions,
                plugins,
            });
        }

        return lintWithLocalAnchors(source, file, {
            lintConfig: this.config.lint.config,
            enableMarkdownAttrs: pluginOptions.enableMarkdownAttrs,
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
        const signature = this.anchorRenderSignature(
            source,
            transformOptions,
            revision,
            forAnchors,
        );
        const cached = !forAnchors && signature ? this.anchorRenders.take(signature) : undefined;
        if (cached) {
            if (reportErrors) {
                this.reportAgentPageLinks(file, this.agentPageLinks.get(cached[1]));
            }
            if (anchorIds) {
                collectAnchorIds(cached[0], anchorIds);
            }

            return cached;
        }

        const parser = transformer(configureTransform(transformOptions));

        const document = parser.parseDocument(source);
        if ((reportErrors || forAnchors) && this.toc.audience(file) !== 'agent') {
            const targets = findAgentPageLinks(document.tokens, (path) => this.toc.audience(path));
            this.agentPageLinks.set(document.env, targets);
            if (reportErrors) {
                this.reportAgentPageLinks(file, targets);
            }
        }
        const result = parser.compileDocument(document);
        if (anchorIds) {
            collectAnchorIds(result, anchorIds);
        }

        const output = [result, document.env] as const;
        if (forAnchors && signature && revision === this.markdown.revision) {
            this.anchorRenders.set(signature, output);
        }

        return output;
    }

    private anchorRenderSignature(
        source: string,
        options: Record<string, unknown>,
        revision: number,
        forAnchors: boolean,
    ) {
        if (
            this.config.outputFormat === 'md' ||
            revision !== this.markdown.revision ||
            (!forAnchors && !this.anchorRenders.size)
        ) {
            return undefined;
        }
        return this.anchorRenders.signature(source, options, this.config.idGenerator);
    }

    private reportAgentPageLinks(file: NormalizedPath, targets?: ReadonlySet<NormalizedPath>) {
        for (const target of targets || []) {
            this.logger.error(
                `Human page ${file} links to agent-only page ${target}. Put this link inside a visibility agent block.`,
            );
        }
    }

    private async transformSource(file: NormalizedPath, markdown: string, deps: IncludeInfo[]) {
        const {content, files: embedded, errors} = extractIncludedBlocks(markdown, file);
        const loaded = await remap(deps.map(get('path')), (path) =>
            typeof embedded[path] === 'string' ? embedded[path] : this.files(path, file),
        );
        return {content, files: {...loaded, ...embedded}, errors};
    }

    private async prepareTransform(
        file: NormalizedPath,
        markdown: string,
        options: TransformOptions,
        reportErrors = true,
        loadTitles = true,
    ) {
        const {deps} = options;
        const assets = [...options.assets, ...this.markdown.embeddedAssets(file, markdown, deps)];

        const {content, files, errors} = await this.transformSource(file, markdown, deps);
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

        const transformOptions = {
            ...this.transformConfig(file, assetsRemap, options.pageDiagnostics),
            files,
            titles: loadTitles ? await remap(titles, this.titles) : {},
            assets: assetsRemap,
        };
        return {source: content, assets, pluginOptions: transformOptions};
    }

    private transformConfig(
        path: NormalizedPath,
        assets: Record<string, unknown>,
        pageDiagnostics = false,
    ) {
        const generateID = createIDGeneratorByStrategy(this.config.idGenerator);

        return {
            highlighter,
            // Retain authored attributes until CLI content opts into the new Transform default.
            enableMarkdownAttrs: this.config.enableMarkdownAttrs ?? true,
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
            log: pageDiagnostics ? this.pageLog : this.logger,
            deprecationWarnings: this.config.deprecationWarnings,
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

        if (this.titlesRevision !== this.markdown.revision) {
            this.titlesCache.clear();
            this.titlesRevision = this.markdown.revision;
        }
        let cached = this.titlesCache.get(path);
        if (!cached) {
            const key = path;
            const value = this.markdown
                .withContext(key, () => this.markdown.titles(key))
                .then((titles) =>
                    Object.fromEntries(
                        Object.entries(titles).map(([anchor, title]) => [
                            Buffer.from(anchor, 'utf16le').toString('utf16le'),
                            Buffer.from(title, 'utf16le').toString('utf16le'),
                        ]),
                    ),
                );
            cached = value.catch((error) => {
                if (this.titlesCache.get(key) === cached) {
                    this.titlesCache.delete(key);
                }
                throw error;
            });
            this.titlesCache.set(key, cached);
        }
        return {...(await cached)};
    }
}

// Only physical Markdown pages share occurrences across lint, indexing and rendering.
// Fragments embedded in a leading page have independent source coordinates.
function createPageLogger(logger: Run['logger'], report: (message: string) => void): Run['logger'] {
    const deprecation = (...messages: unknown[]) => {
        if (!logger.deprecationWarnings) {
            return;
        }

        const [message] = messages;
        // The host currently receives formatted text. Only the reporter envelope
        // identifies an occurrence; forward unstructured plugin messages unchanged.
        if (
            messages.length === 1 &&
            typeof message === 'string' &&
            message.startsWith('[DEPRECATED ') &&
            message.includes(' at ') &&
            message.includes('. Use ') &&
            message.includes('. Removal: ')
        ) {
            report(message);
        } else {
            logger.deprecation(...messages);
        }
    };
    Object.defineProperty(deprecation, 'count', {get: () => logger.deprecation.count});
    return Object.assign(Object.create(logger), {deprecation});
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
