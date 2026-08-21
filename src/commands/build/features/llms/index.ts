import type {Build, BuildArgs, OpenapiCompanionEntry, Run} from '~/commands/build';
import type {Command} from '~/core/config';
import type {Toc} from '~/core/toc';

import {dirname, join, relative} from 'node:path';
import {extractFrontMatter} from '@diplodoc/liquid';

import {defined} from '~/core/config';
import {getHooks as getBaseHooks} from '~/core/program';
import {isExternalHref, normalizePath, setExt} from '~/core/utils';
import {OutputFormat} from '~/commands/build/config';

import {MarkdownCollector, SELF_CONTAINED} from '../output-md/collect';

import {stripHtmlTags} from './utils';
import {options, resolveLlmsFullMaxSize} from './config';

export const LLMS_INDEX_FILENAME = 'llms.txt';
export const LLMS_FULL_FILENAME = 'llms-full.txt';

const LLMS_SEPARATOR = '\n\n';
const LLMS_SEPARATOR_SIZE = Buffer.byteLength(LLMS_SEPARATOR, 'utf8');
const LLMS_TRAILING_NEWLINE = '\n';

export type LlmsArgs = {
    llms: boolean;
    llmsFullMaxSize: number;
};

export type LlmsConfig = {
    llms: {
        enabled: boolean;
        description?: string;
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
    href?: NormalizedPath;
    name?: string;
    items?: LlmsTocItem[];
};

/**
 * Generates `llms.txt` (a compact index) and `llms-full.txt` (the whole
 * documentation concatenated) per toc, following the https://llmstxt.org spec.
 *
 * Runs in `AfterAnyRun`, so it works for both `md` and `html` builds. By that
 * point the toc is already resolved and filtered for the current build
 * (vars/conditions and `removeEmptyTocItems`). Hidden items are filtered here
 * independently of `removeHiddenTocItems`, and pages marked `noIndex` in their
 * front matter are dropped as well, so neither leaks into either artifact while
 * both remain available to the regular build. Walking
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
        const entries = await this.excludeNoIndex(run, this.collectEntries(toc, tocDir));

        if (!entries.length) {
            return;
        }

        const title = toc.title || '';

        const index = await this.renderIndex(run, title, entries, tocDir);
        const full = await this.renderFull(run, title, entries);

        await run.write(join(run.output, tocDir, LLMS_INDEX_FILENAME), index, true);
        await run.write(join(run.output, tocDir, LLMS_FULL_FILENAME), full, true);
    }

    /**
     * Drops pages marked `noIndex` in their front matter.
     *
     * `noIndex` means "keep this page out of indexes". An LLM corpus is exactly
     * such an index, so these pages must not reach `llms.txt` or `llms-full.txt`
     * — the same reasoning as for `hidden` in {@link collectEntries}; only the
     * source of the flag differs: `hidden` is a toc property, `noIndex` is page
     * meta.
     *
     * This lives here rather than in `collectEntries` because meta is read
     * asynchronously. Filtering once for both artifacts also guarantees the index
     * and the corpus stay consistent with each other.
     *
     * Front matter is read directly from the source file rather than from
     * `run.meta.dump()`. When `--jobs` is enabled, `process()` runs in a worker
     * thread with its own `MetaService` instance; the main thread's `MetaService`
     * (where `AfterAnyRun` hooks execute) never receives the front matter, so
     * `run.meta.dump()` returns empty meta and `noIndex` is lost. Reading the
     * raw file bypasses the thread boundary entirely.
     *
     * A page whose meta cannot be read is kept: an unreadable file must not
     * silently vanish from the corpus, and the renderers already report such
     * failures.
     */
    private async excludeNoIndex(run: Run, entries: LlmsEntry[]): Promise<LlmsEntry[]> {
        const noIndexFlags = await Promise.all(
            entries.map(async (entry) => {
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
            if (item.hidden) {
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

    private async renderIndex(run: Run, title: string, entries: LlmsEntry[], tocDir: string) {
        const html = run.config.outputFormat === OutputFormat.html;
        const lines: string[] = [];

        if (title) {
            lines.push(`# ${title}`, '');
        }

        const description = run.config.llms?.description || '';

        if (description) {
            lines.push(`> ${description}`, '');
        }

        lines.push('## Documentation', '');

        const seenOpenapiCompanions = new Set<string>();
        for (const entry of entries) {
            this.appendOpenapiCompanions(run, entry, tocDir, lines, seenOpenapiCompanions);

            const meta = await run.meta.dump(entry.path);
            const description = typeof meta.description === 'string' ? meta.description : '';
            // Prefer the toc name; fall back to the page title (e.g. the root
            // entry has no toc item name), then description, then the href.
            const pageTitle = typeof meta.title === 'string' ? meta.title : '';
            const name = entry.name || pageTitle || description || entry.href;
            const suffix = description ? `: ${description}` : '';
            // Link to the real output file: rendered .html for html builds,
            // the original href (.md/.yaml) for md builds.
            const href = html ? setExt(entry.href, 'html') : entry.href;

            lines.push(`- [${name}](${href})${suffix}`);
        }

        lines.push(
            '',
            '---',
            '',
            `For more comprehensive documentation, see [${LLMS_FULL_FILENAME}](/${LLMS_FULL_FILENAME})`,
        );

        return lines.join('\n') + '\n';
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
            const companionHref = relative(tocDir, companion.companionPath).replace(/\\/g, '/');

            lines.push(`- [${name}](${companionHref}): OpenAPI specification`);
        }
    }

    private async renderFull(run: Run, title: string, entries: LlmsEntry[]) {
        const parts: string[] = [];

        if (title) {
            parts.push(`# ${title}`);
        }

        const maxSize = run.config.llms.llmsFullMaxSize;
        let currentSize = Buffer.byteLength(
            parts.join(LLMS_SEPARATOR) + LLMS_TRAILING_NEWLINE,
            'utf8',
        );

        // Assemble fully self-contained markdown (all includes merged),
        // independent of the build's output format — see MarkdownCollector.
        const collector = new MarkdownCollector(run, SELF_CONTAINED);

        for (const entry of entries) {
            // Leading (yaml) pages have no markdown body to inline; they still
            // appear in the index above.
            if (!entry.path.endsWith('.md')) {
                continue;
            }

            const body = await this.collectBody(run, collector, entry.path);

            if (!body) {
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
                    `llms-full.txt: size limit reached at ${currentSize} bytes ` +
                        `(limit ${maxSize}), stopped before adding ${entry.path}`,
                );
                break;
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
    ): Promise<string> {
        try {
            const body = await collector.collect(entryPath);

            // Strip <style> and <script> blocks — they are useless for LLM
            // consumption (LLMs don't execute JS or apply CSS) and only add
            // noise to the corpus. Code blocks are protected (see stripHtmlTags).
            return stripHtmlTags(body, ['style', 'script']);
        } catch (error) {
            run.logger.warn(`llms-full.txt: unable to assemble ${entryPath}: ${error}`);

            return '';
        }
    }
}
