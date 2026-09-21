import type {ContentAudience} from '@diplodoc/transform/lib/plugins/visibility';
import type {CollectConfig} from './collect';
import type {Run} from '~/commands/build';
import type {LeadingPage} from '~/core/leading';
import type {Meta} from '~/core/meta';
import type {VFile} from '~/core/utils';

import {dirname, join} from 'node:path';
import {flow} from 'lodash';

import {THEME_ASSETS_PATH} from '~/constants';
import {getPublicMeta} from '~/core/meta';
import {all, get, isMediaLink, resolveAbsoluteHref, shortLink} from '~/core/utils';

import {MarkdownCollector} from './collect';
import {resolvePropagatedFrontmatter} from './frontmatter-propagation';
import {addMetaFrontmatter, buildAlternateEntries} from './utils';

type MetaSource = 'hooks' | 'snapshot';

type RendererOptions = {
    metaSource?: MetaSource;
    audience?: ContentAudience;
    collectConfig?: Partial<CollectConfig>;
};

/** Applies the metadata contract used by standalone md2md output. */
export function prepareMarkdownMeta(run: Run, meta: Meta, file: NormalizedPath): Meta {
    if (meta.alternate) {
        // String alternates are a legacy md2md wire format. Keep it stable while
        // adding structured entries for the companion and llms.txt.
        // @ts-ignore -- Meta models the current structured format only.
        meta.alternate = meta.alternate.map(
            flow(get('href'), shortLink, (href: string) =>
                resolveAbsoluteHref(href, run.config.baseHref),
            ),
        );
    }

    try {
        const tocDir = dirname(run.toc.for(file).path) as NormalizedPath;
        const entries = buildAlternateEntries(file, tocDir, run.config.llms, run.config.baseHref);
        if (entries.length) {
            meta.alternate = [...(meta.alternate || []), ...entries];
        }
    } catch {
        // The file is not part of a toc (for example, a standalone include).
    }

    if (run.exists(join(run.output, THEME_ASSETS_PATH))) {
        meta.theme = THEME_ASSETS_PATH;
    }

    return meta;
}

/**
 * Shared md2md renderer used by standalone Markdown builds and static companions.
 * It deliberately owns only per-page work; project initialization remains shared
 * by the enclosing Build run.
 */
export class MarkdownOutputRenderer {
    private readonly run: Run;

    private readonly options: RendererOptions;

    private readonly copiedIncludes = new Set<string>();

    private readonly copiedAssets = new Set<string>();

    constructor(run: Run, options: RendererOptions = {}) {
        this.run = run;
        this.options = options;
    }

    async renderMarkdown(vfile: VFile<string>) {
        await this.collectMarkdown(vfile);
        await this.finalizeMarkdown(vfile);
    }

    async collectMarkdown(vfile: VFile<string>) {
        const config = this.options.collectConfig || this.run.config.preprocess;
        const collector = new MarkdownCollector(this.run, config, {
            copiedIncludes: this.copiedIncludes,
            resolveMeta: this.resolveMeta,
            audience: this.options.audience,
        });

        const collected = await collector.collectWithInfo(vfile.path);
        vfile.data = collected.content;

        for (const error of collected.errors) {
            const message = error.message.replace(` at line ${error.line}`, '');
            this.run.logger.error(`${vfile.path}: ${message}`);
        }
    }

    async finalizeMarkdown(vfile: VFile<string>) {
        const config = this.options.collectConfig || this.run.config.preprocess;
        if (config.mergeIncludes) {
            const propagated = await resolvePropagatedFrontmatter(this.run, vfile.path);
            if (propagated) {
                this.run.meta.add(vfile.path, propagated);
            }
        }

        const meta = getPublicMeta(await this.resolveMeta(vfile.path));
        const lineWidth = config.disableMetaMaxLineWidth ? Infinity : undefined;
        vfile.data = addMetaFrontmatter(vfile.data, meta, lineWidth);

        await this.copyAssets(this.run.markdown, vfile.path);
    }

    async renderLeading(vfile: VFile<LeadingPage>) {
        vfile.data.meta = getPublicMeta(await this.resolveMeta(vfile.path));
        await this.copyAssets(this.run.leading, vfile.path);
    }

    private readonly resolveMeta = async (path: NormalizedPath): Promise<Meta> => {
        if (this.options.metaSource === 'snapshot') {
            return prepareMarkdownMeta(this.run, this.run.meta.snapshot(path), path);
        }

        return this.run.meta.dump(path);
    };

    private async copyAssets(service: Run['leading'] | Run['markdown'], file: NormalizedPath) {
        const assets = await service.assets(file);

        await all(
            assets.map(async ({path, size}) => {
                if (!isMediaLink(path) || this.copiedAssets.has(path)) {
                    return;
                }
                this.copiedAssets.add(path);

                if (this.run.toc.isEntry(path)) {
                    return;
                }

                if (typeof size === 'number' && size > this.run.config.content.maxAssetSize) {
                    this.run.logger.error(
                        'YFM013',
                        `${path}: YFM013 / File asset limit exceeded: ${size} (limit is ${this.run.config.content.maxAssetSize})`,
                    );
                }

                try {
                    this.run.logger.copy(join(this.run.input, path), join(this.run.output, path));
                    await this.run.copy(join(this.run.input, path), join(this.run.output, path));
                } catch (error) {
                    this.run.logger.warn(`Unable to copy resource asset ${path}.`, error);
                }
            }),
        );
    }
}
