import type {Command} from '~/core/config';
import type {Build, Run} from '~/commands/build';

import {join} from 'node:path';
import {extractFrontMatter} from '@diplodoc/liquid';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks} from '~/commands/build';
import {resolveAbsoluteHref, setExt} from '~/core/utils';
import {valuable} from '~/core/config';

import {options} from './config';
import {generateSitemap} from './utils';

export type SitemapArgs = {
    sitemap: boolean;
};

export type SitemapConfig = {
    sitemap: boolean;
};

const SITEMAP_FILENAME = 'sitemap.xml';

export class Sitemap {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('Sitemap', (command: Command) => {
            command.addOption(options.sitemap);
        });

        getBaseHooks(program).Config.tap('Sitemap', (config, args) => {
            let sitemap = false;

            if (valuable(config.sitemap)) {
                sitemap = Boolean(config.sitemap);
            }

            if (valuable(args.sitemap)) {
                sitemap = Boolean(args.sitemap);
            }

            config.sitemap = sitemap;

            return config;
        });

        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('Sitemap', async (run: Run) => {
                if (!run.config.sitemap) {
                    return;
                }

                // A single-page build produces one page per toc, so there is
                // nothing meaningful to put into a sitemap.
                if (run.config.singlePage) {
                    return;
                }

                const {baseHref} = run.config;

                // Sitemap urls must be absolute and there is nothing to resolve
                // page paths against without a publication root.
                if (!baseHref) {
                    run.logger.warn(
                        'Option "sitemap" requires "baseHref" to generate absolute page urls. Skip sitemap.xml generation.',
                    );

                    return;
                }

                const paths = await this.excludeNoIndex(run, run.toc.entries);
                const urls = paths.map((entry) =>
                    resolveAbsoluteHref(setExt(entry, '.html'), baseHref),
                );

                await run.write(join(run.output, SITEMAP_FILENAME), generateSitemap(urls), true);
            });
    }

    /**
     * Drops pages marked `noIndex` by a TOC reference or their front matter.
     *
     * `noIndex` means "keep this page out of indexes" and a sitemap is exactly
     * an index for crawlers, so such pages must not reach sitemap.xml. This
     * mirrors the Llms feature behavior.
     *
     * Front matter is read directly from the source file rather than from
     * `run.meta.dump()`. When `--jobs` is enabled, `process()` runs in a worker
     * thread with its own `MetaService` instance; the main thread's `MetaService`
     * (where `AfterRun` hooks execute) never receives the front matter.
     */
    private async excludeNoIndex(run: Run, entries: NormalizedPath[]): Promise<NormalizedPath[]> {
        const keep = await Promise.all(
            entries.map(async (entry) => {
                if (run.meta.get(entry)?.noIndex === true) {
                    return false;
                }

                try {
                    // Only `.md` files have YAML front matter delimited by `---`.
                    // Leading pages (`.yaml`) store their metadata differently, so
                    // fall back to `run.meta.dump()` for them — leading pages are
                    // never marked `noIndex` in practice.
                    if (!entry.endsWith('.md')) {
                        const meta = await run.meta.dump(entry);

                        return !(
                            meta?.noIndex === true ||
                            (meta?.['docs-viewer'] as {noIndex?: boolean})?.noIndex === true
                        );
                    }

                    const source = join(run.input, entry);
                    const raw = await run.read(source as AbsolutePath);
                    const [frontmatter] = extractFrontMatter(raw);

                    // `noIndex` can live at the meta root (standard YFM frontmatter)
                    // or under the `docs-viewer` namespace (viewer-specific config).
                    return !(
                        frontmatter?.noIndex === true ||
                        (frontmatter?.['docs-viewer'] as {noIndex?: boolean})?.noIndex === true
                    );
                } catch {
                    // A page whose meta cannot be read is kept: it must not
                    // silently vanish from the sitemap.
                    return true;
                }
            }),
        );

        return entries.filter((_, index) => keep[index]);
    }
}
