import type {Command} from '~/core/config';
import type {Build, Run} from '~/commands/build';

import {join} from 'node:path';
import {load} from 'js-yaml';
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

type PageMeta = {
    noIndex?: boolean;
    'docs-viewer'?: {noIndex?: boolean};
};

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

                // Sitemap urls must be absolute. Without a publication root there is
                // nothing to resolve page paths against, and a malformed one (e.g.
                // `example.com/docs`) makes resolveAbsoluteHref silently keep page
                // paths relative.
                if (!baseHref || !URL.canParse(baseHref)) {
                    run.logger.warn(
                        'Option "sitemap" requires a valid absolute "baseHref" to generate absolute page urls. Skip sitemap.xml generation.',
                    );

                    return;
                }

                const paths = await this.excludeNoIndex(run, run.toc.entries);
                const urls = paths.map((entry) =>
                    resolveAbsoluteHref(setExt(entry, '.html'), baseHref),
                );

                // resolveAbsoluteHref keeps a path as is when it cannot be resolved:
                // a relative loc would violate the absolute urls requirement, so the
                // whole file is skipped instead of writing an invalid sitemap.
                if (urls.some((url) => !URL.canParse(url))) {
                    run.logger.warn(
                        'Failed to resolve absolute page urls against "baseHref". Skip sitemap.xml generation.',
                    );

                    return;
                }

                await run.write(join(run.output, SITEMAP_FILENAME), generateSitemap(urls), true);
            });
    }

    /**
     * Drops pages marked `noIndex` by a TOC reference or their source metadata.
     *
     * `noIndex` means "keep this page out of indexes" and a sitemap is exactly
     * an index for crawlers, so such pages must not reach sitemap.xml. This
     * mirrors the Llms feature behavior.
     *
     * Page metadata is always read from the source file rather than from
     * `MetaService`: when `--jobs` is enabled, `process()` runs in a worker
     * thread with its own `MetaService` instance, and page metadata processed
     * there never reaches the main thread's instance (where `AfterRun` hooks
     * execute). Only the first check (TOC restrictions collected by
     * `toc.init()`) uses the main thread's `MetaService`.
     *
     * A page whose metadata cannot be read is kept: it must not silently vanish
     * from the sitemap.
     */
    private async excludeNoIndex(run: Run, entries: NormalizedPath[]): Promise<NormalizedPath[]> {
        const keep = await Promise.all(
            entries.map(async (entry) => {
                if (run.meta.get(entry)?.noIndex === true) {
                    return false;
                }

                try {
                    const source = join(run.input, entry);
                    const raw = await run.read(source as AbsolutePath);

                    let meta: PageMeta | null | undefined;

                    if (entry.endsWith('.md')) {
                        // Only `.md` files have YAML front matter delimited by `---`.
                        meta = extractFrontMatter(raw)[0] as PageMeta | null;
                    } else {
                        // Leading pages (`.yaml`) keep their metadata under the
                        // document's `meta` section (see tests/mocks/metadata);
                        // fall back to the document root for resilience.
                        const doc = load(raw) as (PageMeta & {meta?: PageMeta}) | null;

                        meta = doc?.meta ?? doc;
                    }

                    // `noIndex` can live at the meta root (standard YFM frontmatter)
                    // or under the `docs-viewer` namespace (viewer-specific config).
                    return !(
                        meta?.noIndex === true ||
                        (meta?.['docs-viewer'] as {noIndex?: boolean} | undefined)?.noIndex === true
                    );
                } catch {
                    return true;
                }
            }),
        );

        return entries.filter((_, index) => keep[index]);
    }
}
