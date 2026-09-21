import type {Run} from '~/commands/build';
import type {EntryGraph, EntryGraphNode} from '~/core/markdown';
import type {Meta} from '~/core/meta';
import type {HashedGraphNode} from './utils';
import type {
    AudienceFilterResult,
    ContentAudience,
    VisibilityError,
} from '@diplodoc/transform/lib/plugins/visibility';

import {join} from 'node:path';
import {filterAudienceContent} from '@diplodoc/transform/lib/plugins/visibility';

import {all, get} from '~/core/utils';
import {getPublicMeta} from '~/core/meta';

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

export type CollectedMarkdown = {
    content: string;
    audienceSpecificContent: ContentAudience[];
    errors: VisibilityError[];
};

type CollectorOptions = {
    copiedIncludes?: Set<string>;
    resolveMeta?: (path: NormalizedPath) => Promise<Meta>;
    audience?: ContentAudience;
};

type CollectedDependency = HashedGraphNode & {
    assets: EntryGraph['assets'];
    audienceResults: AudienceFilterResult[];
};

type CollectedGraphNode = Omit<EntryGraph, 'deps'> & {
    deps: CollectedDependency[];
    hash: string;
    audienceResults: AudienceFilterResult[];
};

const LOCATION_MARKER_START = '\uE000DIPLODOC_LOCATION_';
const LOCATION_MARKER_END = '\uE001';

/**
 * Filters one graph node before include merging while retaining dependency offsets.
 * Temporary text markers let the transform visibility parser decide which include
 * directives survive without duplicating its container parsing in the collector.
 */
export function filterGraphAudience<T extends EntryGraph>(
    graph: T,
    audience: ContentAudience,
): {graph: T; result: AudienceFilterResult} {
    const probe = filterAudienceContent(graph.content, audience);
    if (
        probe.content === graph.content &&
        probe.audienceSpecificContent.length === 0 &&
        probe.errors.length === 0
    ) {
        return {graph, result: probe};
    }

    if (graph.deps.length === 0 && graph.assets.length === 0) {
        return {graph: {...graph, content: probe.content}, result: probe};
    }

    let salt = 0;
    while (graph.content.includes(`${LOCATION_MARKER_START}${salt}_`)) {
        salt++;
    }

    const marker = (kind: 'asset' | 'dep', index: number) =>
        `${LOCATION_MARKER_START}${salt}_${kind}_${index}${LOCATION_MARKER_END}`;
    let marked = graph.content;

    const located = [
        ...graph.deps.map((item, index) => ({kind: 'dep' as const, index, item})),
        ...graph.assets.map((item, index) => ({kind: 'asset' as const, index, item})),
    ].sort((left, right) => right.item.location[0] - left.item.location[0]);

    for (const {kind, index, item} of located) {
        marked =
            marked.slice(0, item.location[0]) +
            marker(kind, index) +
            marked.slice(item.location[1]);
    }

    const result = filterAudienceContent(marked, audience);
    const markerRe = new RegExp(
        String.raw`${LOCATION_MARKER_START}${salt}_(asset|dep)_(\d+)${LOCATION_MARKER_END}`,
        'g',
    );
    const deps: EntryGraphNode[] = [];
    const assets: EntryGraph['assets'] = [];
    const parts: string[] = [];
    let cursor = 0;
    let length = 0;

    for (const match of result.content.matchAll(markerRe)) {
        const prefix = result.content.slice(cursor, match.index);
        const kind = match[1] as 'asset' | 'dep';
        const index = Number(match[2]);
        const item = kind === 'dep' ? graph.deps[index] : graph.assets[index];
        const source = graph.content.slice(...item.location);
        parts.push(prefix, source);
        length += prefix.length;
        const start = length;
        length += source.length;

        if (kind === 'dep') {
            deps.push({...graph.deps[index], location: [start, length]});
        } else {
            assets.push({...graph.assets[index], location: [start, length]});
        }
        cursor = (match.index || 0) + match[0].length;
    }

    parts.push(result.content.slice(cursor));

    return {
        graph: {...graph, content: parts.join(''), deps, assets},
        result,
    };
}

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

    private readonly resolveMeta: (path: NormalizedPath) => Promise<Meta>;

    private readonly audience?: ContentAudience;

    constructor(
        run: Run,
        config: Partial<CollectConfig>,
        {
            copiedIncludes = new Set(),
            resolveMeta = (path) => run.meta.dump(path),
            audience,
        }: CollectorOptions = {},
    ) {
        this.run = run;
        this.config = config;
        this.copiedIncludes = copiedIncludes;
        this.resolveMeta = resolveMeta;
        this.audience = audience;
    }

    /**
     * Returns the fully assembled, self-contained markdown for `path`.
     */
    async collect(path: NormalizedPath): Promise<string> {
        return (await this.collectWithInfo(path)).content;
    }

    async collectWithInfo(path: NormalizedPath): Promise<CollectedMarkdown> {
        const graph = await this.run.markdown.graph(path);
        const collected = await this.dump(graph);
        const results = collected.audienceResults;

        return {
            content: collected.content,
            audienceSpecificContent: [
                ...new Set(results.flatMap((result) => result.audienceSpecificContent)),
            ],
            errors: results.flatMap((result) => result.errors),
        };
    }

    // Preserves per-directive IncludeInfo fields (link, match, location) which
    // may differ for same-path deps (e.g. same file included with different
    // #hash fragments).
    private dumpDep = async (dep: EntryGraphNode): Promise<CollectedDependency> => {
        const dumped = await this.dump(dep, true);

        return {
            ...dumped,
            search: dep.search,
            link: dep.link,
            match: dep.match,
            location: dep.location,
        };
    };

    private async dump(graph: EntryGraph, write = false): Promise<CollectedGraphNode> {
        const {run, config, processed, titles, svgList, copiedIncludes} = this;

        const cached = processed.get(graph.path);
        if (cached) {
            return cached;
        }

        const filtered = this.audience ? filterGraphAudience(graph, this.audience) : null;
        const source = filtered?.graph || graph;
        const deps = await all(source.deps.map(this.dumpDep));
        const scheduler = new Scheduler([
            config.hashIncludes && !config.mergeIncludes && rehashIncludes(run, deps),
            config.mergeIncludes &&
                mergeIncludes(run, deps, source.content, config.mergeIncludesSourceMaps, !write),
            config.mergeAutotitles && mergeAutotitles(run, titles, source.assets),
            config.mergeSvg && mergeSvg(run, svgList, source.assets),
        ]);

        await scheduler.schedule(source.path);

        const content = await scheduler.process(source.content);

        const hash = config.hashIncludes ? rehashContent(content) : '';
        const link = signlink(source.path, hash);
        const hashed: CollectedGraphNode = {
            ...source,
            deps,
            content,
            hash,
            audienceResults: [
                ...(filtered ? [filtered.result] : []),
                ...deps.flatMap((dep) => dep.audienceResults),
            ],
        };

        processed.set(source.path, hashed);

        if (copiedIncludes.has(link) || !write || config.mergeIncludes) {
            return hashed;
        }
        copiedIncludes.add(link);

        try {
            run.logger.copy(join(run.input, source.path), join(run.output, link));

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
            const vars = run.vars.for(source.path);
            run.meta.addSystemVars(source.path, vars.__system);
            run.meta.addMetadata(source.path, vars.__metadata);

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
            if (run.toc.isEntry(source.path)) {
                const vcsMeta = await run.vcs.metadata(source.path, source.deps.map(get('path')));
                run.meta.add(source.path, vcsMeta);
                run.meta.addResources(source.path, vcsMeta);
            }

            const includeMeta = getPublicMeta(await this.resolveMeta(source.path));
            const lineWidth = config.disableMetaMaxLineWidth ? Infinity : undefined;
            const contentWithMeta = addMetaFrontmatter(hashed.content, includeMeta, lineWidth);

            await run.write(join(run.output, link), contentWithMeta, link !== graph.path);
        } catch (error) {
            run.logger.warn(`Unable to copy dependency ${graph.path}.`, error);
        }

        return hashed;
    }
}
