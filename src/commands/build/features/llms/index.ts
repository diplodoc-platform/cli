import type {
    Build,
    BuildArgs,
    EntryInfo,
    OpenapiCompanionEntry,
    RebuildChanges,
    Run,
} from '~/commands/build';
import type {Command} from '~/core/config';
import type {Toc, TocLlmsConfig} from '~/core/toc';

import {dirname, join, relative} from 'node:path';
import {eachSeries} from 'async';
import {dump, load} from 'js-yaml';
import {extractFrontMatter} from '@diplodoc/liquid';
import {
    type ContentAudience,
    filterAudienceContent,
} from '@diplodoc/transform/lib/plugins/visibility';

import {defined} from '~/core/config';
import {resolveLlmsConfig} from '~/core/toc';
import {getHooks as getBaseHooks} from '~/core/program';
import {isExternalHref, normalizePath, resolveAbsoluteHref, setExt, shortLink} from '~/core/utils';
import {OutputFormat} from '~/commands/build/config';

import {getHooks as getEntryHooks} from '../../services/entry/hooks';
import {getHooks as getBuildHooks} from '../../hooks';
import {CollectedContentCache, MarkdownCollector, SELF_CONTAINED} from '../output-md/collect';
import {resolveAbsolutePaths} from '../output-md/plugins/merge-includes';

import {getArticleTitle, getPreparedArticleTitle, stripHtmlTags} from './utils';
import {options, resolveLlmsFullMaxSize} from './config';

export const LLMS_INDEX_FILENAME = 'llms.txt';
export const LLMS_FULL_FILENAME = 'llms-full.txt';
export const LLMS_FULL_AGENT_FILENAME = 'llms-full-agent.txt';
export const LLMS_AGENT_FILENAME = 'llms-agent.txt';

const LLMS_SEPARATOR = '\n\n';
const LLMS_SEPARATOR_SIZE = Buffer.byteLength(LLMS_SEPARATOR, 'utf8');
const LLMS_TRAILING_NEWLINE = '\n';

export type LlmsArgs = {
    llms: boolean;
    llmsFullMaxSize: number;
};

export type LlmsConfig = {
    llms: TocLlmsConfig & {
        enabled: boolean;
        llmsFullMaxSize: number;
        /**
         * Override URL for `llms.txt` used in md companion AI hints.
         * When set, md companions link to this URL instead of the generated `llms.txt`.
         */
        url?: string;
    };
};

type LlmsEntry = {
    // Href relative to the toc directory, as written in the toc — used for links.
    href: NormalizedPath;
    // Full normalized path from the input root — used to read meta / markdown.
    path: NormalizedPath;
    name: string;
    // Name of the parent toc item, used for artifacts that represent the whole section.
    parentName: string;
};

type LlmsTocItem = {
    hidden?: boolean;
    noIndex?: boolean;
    href?: NormalizedPath;
    name?: string;
    items?: LlmsTocItem[];
};

type CollectionOptions = {
    pageVisibility?: boolean;
    audience: ContentAudience;
    fileName: string;
    reportErrors?: boolean;
    audienceSpecificContent?: Set<ContentAudience>;
    pageTitles?: Map<NormalizedPath, string>;
    staticArtifacts?: {
        pending: Set<NormalizedPath>;
        written: Set<NormalizedPath>;
    };
};

type CachedIndex = {
    header: string;
    body: string;
    tocShape: string;
    agent: boolean;
    agentIndexBody?: string;
};

/**
 * Generates `llms.txt` (a compact index) and `llms-full.txt` (the whole
 * documentation concatenated) per toc, following the https://llmstxt.org spec.
 *
 * Runs in `AfterAnyRun`, so it works for both `md` and `html` builds. By that
 * point the toc is already resolved and filtered for the current build
 * (vars/conditions and `removeEmptyTocItems`). Hidden and `noIndex` TOC branches
 * are filtered here independently of `removeHiddenTocItems`, and pages marked
 * `noIndex` in their front matter are dropped as well, so none leak into either
 * artifact while they remain available to the regular build. Walking
 * `run.toc.tocs` mirrors `SinglePage`.
 *
 * `llms-full.txt` is assembled with {@link MarkdownCollector} — the same engine
 * `OutputMd` uses — so every include is merged into self-contained markdown
 * regardless of the build's output format (no md/html fork).
 *
 * Index links point to the actual output files: original href in `md`, the
 * rendered `.html` in `html`.
 */
export class Llms {
    private readonly pages = new WeakMap<
        Run,
        Map<NormalizedPath, NonNullable<EntryInfo['llms']>>
    >();

    private readonly collections = new WeakMap<Run, CollectedContentCache>();

    private readonly indexes = new WeakMap<Run, Map<NormalizedPath, CachedIndex>>();

    apply(program: Build) {
        getBaseHooks(program).Command.tap('Llms', (command: Command) => {
            command.addOption(options.llms);
            command.addOption(options.llmsFullMaxSize);
        });

        getBaseHooks(program).Config.tap('Llms', (config, args) => {
            const llmsDescription = config?.llms?.description || '';
            const onlyMd = config.outputFormat === OutputFormat.md;

            const enabled = this.resolveLlmsEnabled(args, config.llms, onlyMd);
            const llmsFullMaxSize = resolveLlmsFullMaxSize(args, config.llms || {});

            config.llms = {
                ...(typeof config.llms === 'object' ? config.llms : {}),
                enabled,
                description: llmsDescription,
                llmsFullMaxSize,
                url: config?.llms?.url,
            };

            return config;
        });

        getBuildHooks(program)
            .BeforeRun.for('md')
            .tap('Llms', (run) => {
                if (!run.config.llms?.enabled) {
                    return;
                }
                getEntryHooks(run.entry).Dump.tap('Llms', (vfile) => {
                    const {meta, content, type} = vfile.data;
                    const title = typeof meta.title === 'string' ? meta.title : '';
                    const description =
                        typeof meta.description === 'string' ? meta.description : '';
                    const page: NonNullable<EntryInfo['llms']> = {
                        title,
                        description,
                    };
                    const preprocess = run.config.preprocess;
                    if (title.trim()) {
                        page.h1 = '';
                    } else if (type === 'yaml') {
                        page.h1 = content.data.title || '';
                    } else {
                        const [, markdown] = extractFrontMatter(content.toString());
                        page.h1 = getPreparedArticleTitle(
                            markdown,
                            run.config.allowHtml,
                            Boolean(
                                preprocess.mergeIncludes &&
                                    preprocess.mergeAutotitles &&
                                    !preprocess.mergeIncludesSourceMaps,
                            ),
                        );
                    }
                    Object.assign(vfile.info, {llms: page});
                });
            });
        getBuildHooks(program)
            .Entry.for('md')
            .tap('Llms', (run, path, info) => {
                if (info.llms) {
                    let pages = this.pages.get(run);
                    if (!pages) {
                        pages = new Map();
                        this.pages.set(run, pages);
                    }
                    pages.set(path, info.llms);
                }
            });

        getBaseHooks<Run>(program).AfterAnyRun.tapPromise('Llms', async (run) => {
            if (!run.config.llms?.enabled) {
                return;
            }

            for (const toc of run.toc.tocs) {
                try {
                    await this.generate(run, toc);
                } catch (error) {
                    run.logger.error(`Unable to generate llms.txt for ${toc.path}: ${error}`);
                }
            }
        });

        getBuildHooks(program).AfterRebuild.tapPromise('Llms', (run, changes) =>
            this.refresh(run, changes),
        );
    }

    private async refresh(run: Run, changes: RebuildChanges) {
        if (!run.config.llms?.enabled) {
            return;
        }

        // Merged toc.yaml includes are TOC sources too, but not standalone TOCs.
        const metadataOnly = [...changes.files].every(
            (path) => /(^|\/)toc\.yaml$/.test(path) && !run.toc.isGenerator(path),
        );
        const affected = new Set(changes.tocs);
        if (!metadataOnly) {
            this.addReferencingTocs(run, changes.entries, affected);
            // Bound retained collection data across repeated watch edits.
            this.collections.delete(run);
        }

        await eachSeries(affected.values(), async (path) => {
            try {
                await this.refreshToc(run, path, metadataOnly);
            } catch (error) {
                run.logger.error(`Unable to generate llms.txt for ${path}: ${error}`);
            }
        });
    }

    private addReferencingTocs(
        run: Run,
        entries: RebuildChanges['entries'],
        affected: Set<NormalizedPath>,
    ) {
        // Page/include/preset edits can affect every TOC that references a page,
        // not just the nearest TOC used by its navigation and describedby link.
        const pending: string[] = [...entries];
        const visited = new Set<string>();
        for (const entry of pending) {
            if (visited.has(entry) || !run.toc.relations.hasNode(entry)) {
                continue;
            }
            visited.add(entry);
            for (const path of run.toc.relations.directDependentsOf(entry)) {
                if (run.toc.isToc(path as NormalizedPath)) {
                    affected.add(path as NormalizedPath);
                }
                pending.push(path);
            }
        }
    }

    private async refreshToc(run: Run, path: NormalizedPath, metadataOnly: boolean) {
        if (!run.toc.isToc(path)) {
            await this.removeArtifacts(run, path);
            return;
        }
        const toc = run.toc.for(path);
        const cached = this.indexes.get(run)?.get(path);
        if (metadataOnly && cached?.tocShape === this.tocShape(toc)) {
            // Summary/details affect only the index header. Reuse the links
            // and full corpora instead of reading and collecting every article.
            const header = this.renderIndexHeader(
                toc.title || '',
                resolveLlmsConfig(run.config.llms, toc),
            );
            if (header !== cached.header) {
                await run.write(
                    join(run.output, dirname(path), LLMS_INDEX_FILENAME),
                    header + cached.body,
                    true,
                );
                if (cached.agentIndexBody !== undefined) {
                    await run.write(
                        join(run.output, dirname(path), LLMS_AGENT_FILENAME),
                        header + cached.agentIndexBody,
                        true,
                    );
                }
                cached.header = header;
            }
        } else {
            await this.generate(run, toc);
        }
    }

    private tocShape(toc: Toc) {
        return JSON.stringify({...toc, llms: undefined});
    }

    private async removeArtifacts(run: Run, path: NormalizedPath) {
        const indexes = this.indexes.get(run);
        if (!indexes?.has(path)) {
            return;
        }
        await eachSeries(
            [
                LLMS_INDEX_FILENAME,
                LLMS_FULL_FILENAME,
                LLMS_FULL_AGENT_FILENAME,
                LLMS_AGENT_FILENAME,
            ],
            async (file) => {
                await run.remove(join(run.output, dirname(path), file));
            },
        );
        indexes.delete(path);
    }

    private collectionCache(run: Run) {
        let cache = this.collections.get(run);
        if (!cache) {
            cache = new CollectedContentCache();
            this.collections.set(run, cache);
        }
        return cache;
    }

    private resolveLlmsEnabled(
        args: BuildArgs,
        config: Partial<LlmsConfig['llms']> | undefined,
        onlyMd: boolean,
    ): boolean {
        const llmsArg = defined('llms', args);

        if (!Object.is(llmsArg, null)) {
            return llmsArg as boolean;
        }

        const configRaw = defined('enabled', config || {}, {enabled: onlyMd});
        return configRaw === 'md' ? onlyMd : (configRaw as boolean);
    }

    private async generate(run: Run, toc: Toc) {
        const tocDir = dirname(toc.path);
        const allEntries = await this.excludeNoIndex(run, this.collectEntries(toc, tocDir));
        const entries = allEntries.filter((entry) => run.toc.audience(entry.path) !== 'agent');

        if (!allEntries.length) {
            await this.removeArtifacts(run, toc.path);
            return;
        }

        const title = toc.title || '';
        const config = resolveLlmsConfig(run.config.llms, toc);

        // Reuse the human collection for titles, retaining only strings rather
        // than another copy of every assembled article in memory.
        const pageTitles = new Map<NormalizedPath, string>();
        const audienceSpecificContent = new Set<ContentAudience>();
        const full = await this.renderFull(run, title, entries, {
            audience: 'human',
            fileName: LLMS_FULL_FILENAME,
            audienceSpecificContent,
            pageTitles,
        });
        const index = await this.renderIndex(run, title, entries, tocDir, config, pageTitles);

        await run.write(join(run.output, tocDir, LLMS_INDEX_FILENAME), index, true);
        await run.write(join(run.output, tocDir, LLMS_FULL_FILENAME), full, true);

        // Build audience artifacts once; the viewer selects them without reparsing a corpus.
        const hasAgentPages = allEntries.length !== entries.length;
        const agent =
            hasAgentPages ||
            (run.config.outputFormat === OutputFormat.md && audienceSpecificContent.size > 0);
        let agentIndex: string | undefined;
        if (agent) {
            const agentTitles = new Map<NormalizedPath, string>();
            const staticArtifacts =
                hasAgentPages && run.config.outputFormat === OutputFormat.html
                    ? {
                          pending: new Set(allEntries.map((entry) => entry.path)),
                          written: new Set<NormalizedPath>(),
                      }
                    : undefined;
            const agentFull = await this.renderFull(run, title, allEntries, {
                pageVisibility: hasAgentPages,
                audience: 'agent',
                fileName: LLMS_FULL_AGENT_FILENAME,
                reportErrors: hasAgentPages,
                pageTitles: agentTitles,
                staticArtifacts,
            });
            await run.write(join(run.output, tocDir, LLMS_FULL_AGENT_FILENAME), agentFull, true);
            if (hasAgentPages) {
                agentIndex = await this.renderIndex(
                    run,
                    title,
                    allEntries,
                    tocDir,
                    config,
                    agentTitles,
                    'agent',
                );
                await run.write(join(run.output, tocDir, LLMS_AGENT_FILENAME), agentIndex, true);
                if (staticArtifacts) {
                    await this.writeStaticAgentTargets(run, staticArtifacts);
                }
            }
        } else if (this.indexes.get(run)?.get(toc.path)?.agent) {
            await run.remove(join(run.output, tocDir, LLMS_FULL_AGENT_FILENAME));
        }
        if (!hasAgentPages && this.indexes.get(run)?.get(toc.path)?.agentIndexBody !== undefined) {
            await run.remove(join(run.output, tocDir, LLMS_AGENT_FILENAME));
        }

        if (run.config.watch) {
            let indexes = this.indexes.get(run);
            if (!indexes) {
                indexes = new Map();
                this.indexes.set(run, indexes);
            }
            const header = this.renderIndexHeader(title, config);
            indexes.set(toc.path, {
                header,
                body: index.slice(header.length),
                tocShape: this.tocShape(toc),
                agent,
                agentIndexBody: agentIndex?.slice(header.length),
            });
        }
    }

    /** Write each linked target once, without adding hidden/noIndex pages to a corpus. */
    private async writeStaticAgentTargets(
        run: Run,
        staticArtifacts: NonNullable<CollectionOptions['staticArtifacts']>,
    ) {
        // Iterating the Set also visits targets discovered while collecting earlier pages.
        for (const path of staticArtifacts.pending) {
            if (staticArtifacts.written.has(path)) {
                continue;
            }
            staticArtifacts.written.add(path);

            let content: string;
            if (path.endsWith('.md')) {
                const collector = new MarkdownCollector(run, SELF_CONTAINED, {
                    audience: 'agent',
                    processedContent: this.collectionCache(run),
                });
                content = await this.collectBody(run, collector, path, {
                    audience: 'agent',
                    pageVisibility: true,
                    fileName: LLMS_AGENT_FILENAME,
                    staticArtifacts,
                });
            } else {
                const raw = await run.read(join(run.input, path) as AbsolutePath);
                content = dump(
                    filterAgentYaml(load(raw), (value) => {
                        const resolveLink = (href: string) =>
                            resolveAgentPageLink(run, path, href, staticArtifacts.pending);
                        const filtered = filterAudienceContent(value, 'agent').content;
                        // A YAML leaf can be a direct href or Markdown prose; do not turn
                        // arbitrary text/extensionless configuration strings into URLs.
                        return /^\S+\.(?:md|html|ya?ml)(?:[?#].*)?$/i.test(filtered)
                            ? resolveLink(filtered)
                            : resolveAbsolutePaths(
                                  filtered,
                                  path,
                                  run.config.baseHref || '',
                                  resolveLink,
                              );
                    }),
                );
            }

            await run.write(
                join(run.output, setExt(path, path.endsWith('.md') ? '.agent.md' : '.agent.yaml')),
                content,
                true,
            );
        }
    }

    /**
     * Drops pages marked `noIndex` by any TOC reference or their front matter.
     *
     * `noIndex` means "keep this page out of indexes". An LLM corpus is exactly
     * such an index, so these pages must not reach `llms.txt` or `llms-full.txt`
     * — the same reasoning as for `hidden` in {@link collectEntries}; only the
     * source of the flag differs: {@link collectEntries} prunes TOC subtrees,
     * while MetaService keeps the combined TOC restriction for each page. Check
     * it here too: a page may also be linked from a public TOC branch.
     *
     * This lives here rather than in `collectEntries` because meta is read
     * asynchronously. Filtering once for both artifacts also guarantees the index
     * and the corpus stay consistent with each other.
     *
     * Front matter is read directly from the source file rather than from
     * `run.meta.dump()`. When `--jobs` is enabled, `process()` runs in a worker
     * thread with its own `MetaService` instance; the main thread's `MetaService`
     * (where `AfterAnyRun` hooks execute) never receives the front matter.
     * It already has TOC metadata from `toc.init()`, so check that first, then
     * read the raw file to include worker-only frontmatter restrictions.
     *
     * A page without a TOC restriction whose meta cannot be read is kept: it must not
     * silently vanish from the corpus, and the renderers already report such
     * failures.
     */
    private async excludeNoIndex(run: Run, entries: LlmsEntry[]): Promise<LlmsEntry[]> {
        const noIndexFlags = await Promise.all(
            entries.map(async (entry) => {
                if (run.meta.get(entry.path)?.noIndex === true) {
                    return true;
                }

                try {
                    // Only `.md` files have YAML front matter delimited by `---`.
                    // Leading pages (`.yaml`) store their metadata differently, so
                    // fall back to `run.meta.dump()` for them — leading pages are
                    // never marked `noIndex` in practice, but the fallback keeps
                    // the behaviour unchanged for any file type we don't read raw.
                    if (!entry.path.endsWith('.md')) {
                        const meta = await run.meta.dump(entry.path);
                        return (
                            meta?.noIndex === true ||
                            (meta?.['docs-viewer'] as {noIndex?: boolean})?.noIndex === true
                        );
                    }

                    const source = join(run.input, entry.path);
                    const raw = await run.read(source as AbsolutePath);
                    const [frontmatter] = extractFrontMatter(raw);

                    // `noIndex` can live at the meta root (standard YFM frontmatter)
                    // or under the `docs-viewer` namespace (viewer-specific config).
                    // Check both: the test docs use `docs-viewer: { noIndex: true }`.
                    return (
                        frontmatter?.noIndex === true ||
                        (frontmatter?.['docs-viewer'] as {noIndex?: boolean})?.noIndex === true
                    );
                } catch {
                    return false;
                }
            }),
        );

        return entries.filter((_entry, index) => !noIndexFlags[index]);
    }

    private collectEntries(toc: LlmsTocItem, tocDir: string): LlmsEntry[] {
        const entries: LlmsEntry[] = [];

        const visit = (item: LlmsTocItem, parentName = '') => {
            if (item.hidden || item.noIndex === true) {
                return;
            }

            if (typeof item.href === 'string' && item.href && !isExternalHref(item.href)) {
                entries.push({
                    href: item.href,
                    path: normalizePath(join(tocDir, item.href)),
                    name: typeof item.name === 'string' ? item.name : '',
                    parentName,
                });
            }

            const childParentName = typeof item.name === 'string' ? item.name : parentName;
            item.items?.forEach((child) => visit(child, childParentName));
        };

        visit(toc);

        return entries;
    }

    private async renderIndex(
        run: Run,
        title: string,
        entries: LlmsEntry[],
        tocDir: string,
        config: TocLlmsConfig = run.config.llms,
        pageTitles?: ReadonlyMap<NormalizedPath, string>,
        audience: ContentAudience = 'human',
    ) {
        const html = run.config.outputFormat === OutputFormat.html;
        const lines: string[] = ['## Documentation', ''];

        const seenOpenapiCompanions = new Set<string>();
        // Loading includes can replace shared page metadata. Finish each entry
        // before loading the next one, preserving TOC order without concurrency.
        await eachSeries(entries, async (entry) => {
            this.appendOpenapiCompanions(run, entry, tocDir, lines, seenOpenapiCompanions);

            const prepared =
                audience === 'human' ? this.pages.get(run)?.get(entry.path) : undefined;
            const pageTitle =
                prepared?.h1 ??
                pageTitles?.get(entry.path) ??
                (await this.loadPageTitle(run, entry.path));
            if (!prepared && pageTitles?.has(entry.path) && entry.path.endsWith('.md')) {
                // A later article may have included this page with different
                // variables. Restore its own metadata before using the cached H1.
                await run.markdown.load(entry.path);
            }
            const meta = prepared || (await run.meta.dump(entry.path));
            const description = typeof meta.description === 'string' ? meta.description : '';
            const metaTitle = typeof meta.title === 'string' ? meta.title : '';
            const name =
                [metaTitle, pageTitle, entry.name, description, entry.href]
                    .map((value) => value.replace(/\s+/g, ' ').trim())
                    .find(Boolean) || entry.href;
            // The extracted title is plain text, including literal inline code.
            // Keep Markdown syntax, HTML tags, and entities literal in the label.
            const label = name.replace(/[\\[\]`*_<>&{}~^$]/g, String.raw`\$&`);
            const suffix = description ? `: ${description}` : '';
            // Link to the artifact that readers can fetch directly. Static HTML
            // builds use source-format companions when enabled; otherwise they
            // keep the HTML route and honor extensionless publishing.
            const relativeHref =
                html && audience === 'agent'
                    ? setExt(entry.href, entry.path.endsWith('.md') ? '.agent.md' : '.agent.yaml')
                    : resolveEntryHref(run, entry.href, html);
            let href = resolveAbsoluteHref(relativeHref, run.config.baseHref, tocDir);
            if (!html && audience === 'agent') {
                href += `${href.includes('?') ? '&' : '?'}audience=agent`;
            }

            lines.push(`- [${label}](${href})${suffix}`);
        });

        const fullName =
            audience === 'agent' && html ? LLMS_FULL_AGENT_FILENAME : LLMS_FULL_FILENAME;
        let fullHref = run.config.baseHref
            ? resolveAbsoluteHref(fullName, run.config.baseHref, tocDir)
            : `/${fullName}`;
        if (audience === 'agent' && !html) {
            fullHref += '?audience=agent';
        }

        lines.push(
            '',
            '---',
            '',
            `For more comprehensive documentation, see [${fullName}](${fullHref})`,
        );

        return this.renderIndexHeader(title, config) + lines.join('\n') + '\n';
    }

    private renderIndexHeader(title: string, config: TocLlmsConfig) {
        const lines: string[] = [];
        if (title) {
            lines.push(`# ${title}`, '');
        }
        if (config.description) {
            lines.push(`> ${config.description}`, '');
        }
        if (config.details) {
            lines.push(config.details.trimEnd(), '');
        }
        return lines.length ? lines.join('\n') + '\n' : '';
    }

    private async loadPageTitle(
        run: Run,
        path: NormalizedPath,
        collectedMarkdown?: string,
    ): Promise<string> {
        // Load through the source services before dumping metadata: worker builds
        // do not populate the main thread's MetaService. This also resolves Liquid
        // consistently and keeps author metadata separate from the article H1.
        const prepared = this.pages.get(run)?.get(path);
        if (prepared?.h1 !== undefined) {
            return prepared.h1;
        }
        try {
            if (path.endsWith('.md')) {
                if (!prepared) {
                    await run.markdown.load(path);
                }
                const meta = prepared || (await run.meta.dump(path));
                if (typeof meta.title === 'string' && meta.title.trim()) {
                    return '';
                }

                if (collectedMarkdown !== undefined) {
                    return getArticleTitle(collectedMarkdown, run.config.allowHtml);
                }

                // Includes are cached by path, but their variables depend on the
                // article. Keep this collector scoped to one article's context.
                const collector = new MarkdownCollector(run, SELF_CONTAINED, {
                    audience: 'human',
                    processedContent: this.collectionCache(run),
                });
                // Match the human document and canonical corpus: resolve includes
                // (including hash/notitle) and filter visibility before selecting H1.
                return getArticleTitle(await collector.collect(path), run.config.allowHtml);
            }

            if (path.endsWith('.yaml') || path.endsWith('.yml')) {
                return (await run.leading.load(path)).title || '';
            }
        } catch (error) {
            run.logger.warn(`llms.txt: unable to read title for ${path}: ${error}`);
        }

        return '';
    }

    /**
     * Appends OpenAPI spec companion links immediately before their leading page.
     *
     * Companions are standalone `*.openapi.json` files emitted by the openapi
     * includer extension (`run.openapiCompanions`). Each entry maps a generated
     * leading page to its companion file. Only companions whose leading page is
     * present in the current toc's entries are included — this keeps multi-lang
     * builds and hidden-page filtering consistent with the rest of the index.
     *
     * The companion is a JSON file (not rendered html), so the link is the same
     * for both md and html builds.
     */
    private appendOpenapiCompanions(
        run: Run,
        entry: LlmsEntry,
        tocDir: string,
        lines: string[],
        seen: Set<string>,
    ): void {
        const companions = (run as Run & {openapiCompanions?: OpenapiCompanionEntry[]})
            .openapiCompanions;

        if (!Array.isArray(companions) || companions.length === 0) {
            return;
        }

        for (const companion of companions) {
            if (seen.has(companion.companionPath)) {
                continue;
            }

            // Match companion to the current entry by leadingPage.
            // leadingPage is the path without extension (e.g. "ru/api/index"),
            // so strip the extension from the entry path to compare.
            if (setExt(entry.path, '') !== companion.leadingPage) {
                continue;
            }

            seen.add(companion.companionPath);

            const name = entry.parentName || entry.name || 'API Reference';
            // Normalize to forward slashes — llms.txt is a web-oriented format
            // and `relative()` returns backslashes on Windows.
            const relativeHref = relative(tocDir, companion.companionPath).replace(/\\/g, '/');
            const companionHref = resolveAbsoluteHref(relativeHref, run.config.baseHref, tocDir);

            lines.push(`- [${name}](${companionHref}): OpenAPI specification`);
        }
    }

    private async renderFull(
        run: Run,
        title: string,
        entries: LlmsEntry[],
        options: CollectionOptions,
    ) {
        const {audience, fileName} = options;
        const processedContent = this.collectionCache(run);
        const parts: string[] = [];

        if (title) {
            parts.push(`# ${title}`);
        }

        const maxSize = run.config.llms.llmsFullMaxSize;
        let currentSize = Buffer.byteLength(
            parts.join(LLMS_SEPARATOR) + LLMS_TRAILING_NEWLINE,
            'utf8',
        );
        let fullLimitReached = false;

        for (const entry of entries) {
            const staticAgent =
                audience === 'agent' && run.config.outputFormat === OutputFormat.html;
            if (fullLimitReached && !staticAgent) {
                break;
            }
            // Leading (yaml) pages have no markdown body to inline; they still
            // appear in the index above.
            if (!entry.path.endsWith('.md')) {
                continue;
            }

            // The same include can resolve differently in each article's preset
            // context. Never share its path-based collection cache across entries.
            const collector = new MarkdownCollector(run, SELF_CONTAINED, {
                audience,
                processedContent,
            });
            const body = await this.collectBody(run, collector, entry.path, options);

            if (staticAgent) {
                await run.write(join(run.output, setExt(entry.path, '.agent.md')), body, true);
                options.staticArtifacts?.written.add(entry.path);
            }

            if (!body || fullLimitReached) {
                continue;
            }

            // Check whether adding this article would exceed the size limit.
            const candidateSize =
                currentSize +
                (parts.length > 0 ? LLMS_SEPARATOR_SIZE : 0) +
                Buffer.byteLength(body, 'utf8');

            if (candidateSize > maxSize) {
                run.logger.info(
                    'YFM022',
                    `${fileName}: size limit reached at ${currentSize} bytes ` +
                        `(limit ${maxSize}), stopped before adding ${entry.path}`,
                );
                fullLimitReached = true;
                continue;
            }

            parts.push(body);
            currentSize = candidateSize;
        }

        return parts.join(LLMS_SEPARATOR) + LLMS_TRAILING_NEWLINE;
    }

    private async collectBody(
        run: Run,
        collector: MarkdownCollector,
        entryPath: NormalizedPath,
        options: CollectionOptions,
    ): Promise<string> {
        const {
            audience,
            pageVisibility = false,
            fileName,
            reportErrors = true,
            audienceSpecificContent,
            pageTitles,
        } = options;
        try {
            const collected = await collector.collectWithInfo(entryPath);
            if (pageTitles) {
                pageTitles.set(
                    entryPath,
                    await this.loadPageTitle(run, entryPath, collected.content),
                );
            }

            // Keep the established order: strip non-LLM HTML before audience
            // filtering. Collection must filter first for dependency safety, so
            // recover only the root's trailing whitespace from the old order.
            const strippedBody = stripHtmlTags(collected.content, ['style', 'script']);
            const source = await run.markdown.graph(entryPath);
            const strippedSource = stripHtmlTags(source.content, ['style', 'script']);
            const filteredSource = filterAudienceContent(strippedSource, audience).content;
            const trailingWhitespace = filteredSource.slice(filteredSource.trimEnd().length);
            const body = strippedBody + trailingWhitespace;

            for (const detectedAudience of collected.audienceSpecificContent) {
                audienceSpecificContent?.add(detectedAudience);
            }

            if (reportErrors) {
                for (const error of collected.errors) {
                    const message = error.message.replace(` at line ${error.line}`, '');
                    run.logger.error(`${fileName}: ${entryPath}: ${message}`);
                }
            }

            if (audience === 'agent' && pageVisibility) {
                return resolveAbsolutePaths(body, entryPath, run.config.baseHref || '', (href) =>
                    resolveAgentPageLink(run, entryPath, href, options.staticArtifacts?.pending),
                );
            }
            return run.config.baseHref
                ? resolveAbsolutePaths(body, entryPath, run.config.baseHref)
                : body;
        } catch (error) {
            run.logger.warn(`${fileName}: unable to assemble ${entryPath}: ${error}`);

            return '';
        }
    }
}

function filterAgentYaml(
    value: unknown,
    rewrite: (value: string) => string,
    seen = new WeakMap<object, unknown>(),
): unknown {
    if (typeof value === 'string') {
        return rewrite(value);
    }
    if (value && typeof value === 'object') {
        if (seen.has(value)) {
            return seen.get(value);
        }
        const result: unknown[] | Record<string, unknown> = Array.isArray(value) ? [] : {};
        seen.set(value, result);
        for (const [key, item] of Object.entries(value)) {
            Object.defineProperty(result, key, {
                value: filterAgentYaml(item, rewrite, seen),
                enumerable: true,
                configurable: true,
                writable: true,
            });
        }
        return result;
    }
    return value;
}

function resolveAgentPageLink(
    run: Run,
    fromPath: NormalizedPath,
    href: string,
    staticTargets?: Set<NormalizedPath>,
): string {
    if (isExternalHref(href) || /^[#*{]/.test(href)) {
        return href;
    }
    const [pathAndQuery, ...hashParts] = href.split('#');
    const [path, query] = pathAndQuery.split('?');
    const filename = path.split('/').pop() || '';
    if (!path || (filename.includes('.') && !/\.(?:md|html|ya?ml)$/i.test(path))) {
        return href;
    }
    const absolute = normalizePath(
        path.startsWith('/') ? path.slice(1) : join(dirname(fromPath), path),
    );
    const candidates = [
        setExt(absolute, '.md'),
        setExt(absolute, '.yaml'),
        join(absolute, 'index.md'),
        join(absolute, 'index.yaml'),
    ];
    const target = candidates
        .map(normalizePath)
        .find((candidate) => run.toc.audience(candidate) !== undefined);
    if (!target) {
        return href;
    }
    const search = new URLSearchParams(query || '');
    let destination = path;
    if (run.config.outputFormat === OutputFormat.html) {
        staticTargets?.add(target);
        destination = setExt(
            normalizePath(relative(dirname(fromPath), target)),
            target.endsWith('.md') ? '.agent.md' : '.agent.yaml',
        );
    } else if (!search.has('audience')) {
        search.set('audience', 'agent');
    }
    return `${destination}${search.size ? `?${search}` : ''}${hashParts.length ? `#${hashParts.join('#')}` : ''}`;
}

function resolveEntryHref(run: Run, entryHref: NormalizedPath, html: boolean) {
    if (!html || run.config.ai.mdCompanions) {
        return entryHref;
    }

    const htmlHref = setExt(entryHref, 'html');
    return run.config.skipHtmlExtension ? shortLink(htmlHref) : htmlHref;
}
