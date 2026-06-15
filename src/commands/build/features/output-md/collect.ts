import type {Run} from '~/commands/build';
import type {EntryGraph, EntryGraphNode} from '~/core/markdown';
import type {HashedGraphNode} from './utils';

import {join} from 'node:path';

import {all, get} from '~/core/utils';

import {Scheduler, addMetaFrontmatter, rehashContent, signlink} from './utils';
import {mergeSvg} from './plugins/merge-svg';
import {mergeAutotitles} from './plugins/merge-autotitles';
import {mergeIncludes} from './plugins/merge-includes';
import {rehashIncludes} from './plugins/resolve-deps';

export type CollectConfig = {
    hashIncludes: boolean;
    mergeIncludes: boolean;
    mergeAutotitles: boolean;
    mergeSvg: boolean;
    disableMetaMaxLineWidth: boolean;
    mergeIncludesSourceMaps: boolean;
};

/**
 * Preset that fully inlines a page into self-contained markdown, independent of
 * the active output format. Used by features that need resolved markdown even
 * during an `html` build (e.g. `Llms`). Includes and autotitles are merged;
 * svg inlining and content hashing are left off (svg xml / hashed links would
 * just be noise for a plain markdown corpus), and include source-map comments
 * are omitted.
 */
export const SELF_CONTAINED: CollectConfig = {
    hashIncludes: false,
    mergeIncludes: true,
    mergeAutotitles: true,
    mergeSvg: false,
    disableMetaMaxLineWidth: false,
    mergeIncludesSourceMaps: false,
};

/**
 * Single source of truth for "how a page becomes self-contained markdown".
 *
 * Recursively walks the entry's dependency graph and merges includes /
 * autotitles / inline svg via the shared step plugins. For the `OutputMd` case
 * (when `mergeIncludes` is off) it also copies non-merged include files to the
 * output, with metadata frontmatter — that branch is unreachable when merging.
 *
 * `OutputMd` drives it with the user's preprocess config; other features reuse
 * it with {@link SELF_CONTAINED} to obtain fully-merged markdown regardless of
 * the build's output format. Extracted verbatim from `OutputMd`'s dump closure
 * so the two never drift.
 *
 * Memoization (`processed`/`titles`/`svgList`) is per-instance, so callers
 * create one collector per logical batch (`OutputMd`: per entry vfile). The
 * `copiedIncludes` set is shared run-wide to dedupe include file copies.
 */
export class MarkdownCollector {
    // Untyped (like the original OutputMd closure): HashedGraphNode pulls in
    // node's UrlWithStringQuery `search`/`hash` fields via IncludeInfo, which
    // the root graph node doesn't carry. Keeping these loose matches the
    // verbatim-extracted logic without fighting that quirk.
    private readonly processed = new Map();
    private readonly titles = new Map<string, string>();
    private readonly svgList = new Map<string, string>();

    private readonly run: Run;
    private readonly config: Partial<CollectConfig>;
    private readonly copiedIncludes: Set<string>;

    constructor(run: Run, config: Partial<CollectConfig>, copiedIncludes: Set<string> = new Set()) {
        this.run = run;
        this.config = config;
        this.copiedIncludes = copiedIncludes;
    }

    /**
     * Returns the fully assembled, self-contained markdown for `path`.
     */
    async collect(path: NormalizedPath): Promise<string> {
        const graph = await this.run.markdown.graph(path);

        return (await this.dump(graph)).content;
    }

    // Preserves per-directive IncludeInfo fields (link, match, location) which
    // may differ for same-path deps (e.g. same file included with different
    // #hash fragments).
    private dumpDep = async (dep: EntryGraphNode): Promise<HashedGraphNode> => {
        const dumped = await this.dump(dep, true);

        return {
            ...dumped,
            link: dep.link,
            match: dep.match,
            location: dep.location,
        };
    };

    private async dump(graph: EntryGraph, write = false) {
        const {run, config, processed, titles, svgList, copiedIncludes} = this;

        const cached = processed.get(graph.path);
        if (cached) {
            return cached;
        }

        const deps: HashedGraphNode[] = await all(graph.deps.map(this.dumpDep));
        const scheduler = new Scheduler([
            config.hashIncludes && !config.mergeIncludes && rehashIncludes(run, deps),
            config.mergeIncludes &&
                mergeIncludes(run, deps, graph.content, config.mergeIncludesSourceMaps, !write),
            config.mergeAutotitles && mergeAutotitles(run, titles, graph.assets),
            config.mergeSvg && mergeSvg(run, svgList, graph.assets),
        ]);

        await scheduler.schedule(graph.path);

        const content = await scheduler.process(graph.content);

        const hash = config.hashIncludes ? rehashContent(content) : '';
        const link = signlink(graph.path, hash);
        const hashed = {...graph, deps, content, hash};

        processed.set(graph.path, hashed);

        if (copiedIncludes.has(link) || !write || config.mergeIncludes) {
            return hashed;
        }
        copiedIncludes.add(link);

        try {
            run.logger.copy(join(run.input, graph.path), join(run.output, link));

            // Add metadata frontmatter to include files.
            // Without this, include files are written without YAML frontmatter,
            // which causes non-deterministic output when the same file is both
            // a TOC entry and an include in another file. The last writer wins,
            // and if the include is written after the entry, metadata is lost.
            // By ensuring both paths produce identical output, write order
            // becomes irrelevant (see ADR-002: Multithreading Build).
            // When these files are used as includes (e.g. md2html), the consumer
            // must strip frontmatter before rendering the body (see output-html
            // includes plugin).
            const vars = run.vars.for(graph.path);
            run.meta.addSystemVars(graph.path, vars.__system);
            run.meta.addMetadata(graph.path, vars.__metadata);

            // When the include file is also a TOC entry, resolve its VCS
            // metadata (vcsPath, contributors, ...) here instead of relying
            // on the entry's markdown Dump hook having run first. The same
            // file may be processed as both a TOC entry and an include
            // dependency concurrently (-j2); without this, the include dump
            // could read `meta` before the entry hook populated `vcsPath`,
            // producing non-deterministic frontmatter. `vcs.metadata` is
            // idempotent (memoized, config gated, deterministic realpath),
            // so resolving it here makes the include dump self-sufficient
            // and write order irrelevant. Pure includes (not TOC entries)
            // are skipped so their output keeps matching the entry path.
            if (run.toc.isEntry(graph.path)) {
                const vcsMeta = await run.vcs.metadata(graph.path, graph.deps.map(get('path')));
                run.meta.add(graph.path, vcsMeta);
                run.meta.addResources(graph.path, vcsMeta);
            }

            const includeMeta = await run.meta.dump(graph.path);
            const lineWidth = config.disableMetaMaxLineWidth ? Infinity : undefined;
            const contentWithMeta = addMetaFrontmatter(hashed.content, includeMeta, lineWidth);

            await run.write(join(run.output, link), contentWithMeta, link !== graph.path);
        } catch (error) {
            run.logger.warn(`Unable to copy dependency ${graph.path}.`, error);
        }

        return hashed;
    }
}
