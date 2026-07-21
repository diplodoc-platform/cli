import type {Build, BuildArgs, Run} from '~/commands/build';
import type {Command} from '~/core/config';
import type {EntryTocItem, Toc} from '~/core/toc';

import {dirname, join} from 'node:path';

import {defined} from '~/core/config';
import {getHooks as getBaseHooks} from '~/core/program';
import {normalizePath, setExt} from '~/core/utils';
import {OutputFormat} from '~/commands/build/config';

import {MarkdownCollector, SELF_CONTAINED} from '../output-md/collect';

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
    };
};

type LlmsEntry = {
    // Href relative to the toc directory, as written in the toc — used for links.
    href: NormalizedPath;
    // Full normalized path from the input root — used to read meta / markdown.
    path: NormalizedPath;
    name: string;
};

/**
 * Generates `llms.txt` (a compact index) and `llms-full.txt` (the whole
 * documentation concatenated) per toc, following the https://llmstxt.org spec.
 *
 * Runs in `AfterAnyRun`, so it works for both `md` and `html` builds. By that
 * point the toc is already resolved and filtered for the current build
 * (vars/conditions, `removeHiddenTocItems`/`removeEmptyTocItems`), which keeps
 * the artifacts consistent with the exact "version" produced by single-source
 * publishing — hidden pages don't leak into the index and inactive `{% if %}`
 * branches don't leak into the full text. Walking `run.toc.tocs` +
 * `walkEntries` mirrors `SinglePage`.
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
        const entries: LlmsEntry[] = [];

        await run.toc.walkEntries([toc as unknown as EntryTocItem], (item) => {
            if (typeof item.href === 'string' && item.href) {
                entries.push({
                    href: item.href,
                    path: normalizePath(join(tocDir, item.href)),
                    name: typeof item.name === 'string' ? item.name : '',
                });
            }

            return item;
        });

        if (!entries.length) {
            return;
        }

        const title = toc.title || '';

        const index = await this.renderIndex(run, title, entries);
        const full = await this.renderFull(run, title, entries);

        await run.write(join(run.output, tocDir, LLMS_INDEX_FILENAME), index, true);
        await run.write(join(run.output, tocDir, LLMS_FULL_FILENAME), full, true);
    }

    private async renderIndex(run: Run, title: string, entries: LlmsEntry[]) {
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

        for (const entry of entries) {
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

            return body.trim();
        } catch (error) {
            run.logger.warn(`llms-full.txt: unable to assemble ${entryPath}: ${error}`);

            return '';
        }
    }
}
