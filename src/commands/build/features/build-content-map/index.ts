import type {Command} from '~/core/config';
import type {Build, Run} from '~/commands/build';

import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {dump as yamlDump, load as yamlLoad} from 'js-yaml';
import pmap from 'p-map';

import {getHooks as getBaseHooks} from '~/core/program';
import {valuable} from '~/core/config';

import {options} from './config';

export const CONTENT_MAP_FILENAME = 'yfm-build-content.json';
export const SCHEMA_VERSION = 1;
const HASH_CONCURRENCY = 30;

type ContentHashEntry = {
    hash: string;
    size: number;
};

type BuildContentFormat = {
    schemaVersion: typeof SCHEMA_VERSION;
    contentHashes: Record<string, ContentHashEntry>;
    pageAssets: Record<string, NormalizedPath[]>;
};

export type BuildContentMapArgs = {
    buildContent: boolean;
};

export type BuildContentMapConfig = {
    buildContent: boolean;
};

type PageAssets = Record<string, NormalizedPath[]>;

// Walks `run.entry.relations` and returns, per entry, the sorted list of its
// direct `resource`-type dependencies (images, videos, svg, etc.). Sources
// (includes) are deliberately skipped — they propagate to entry hashes
// through either `mergeIncludes` (inline content) or `hashIncludes`
// (signlink-renamed filenames in references). Resource deps are the only
// ones whose changes do NOT propagate through the entry's file content.
export function collectPageAssets(run: Run): PageAssets {
    const result: PageAssets = {};
    const relations = run.entry.relations;

    for (const node of relations.overallOrder()) {
        const data = relations.getNodeData(node) as {type?: string} | undefined;
        if (data?.type !== 'entry') {
            continue;
        }

        const assets: NormalizedPath[] = [];
        for (const dep of relations.directDependenciesOf(node)) {
            const depData = relations.getNodeData(dep) as {type?: string} | undefined;
            if (depData?.type === 'resource') {
                assets.push(dep as NormalizedPath);
            }
        }

        if (assets.length === 0) {
            continue;
        }

        assets.sort();
        result[node] = assets;
    }

    return result;
}

// Matches `signlink` output naming: `name-{12hex}.{ext}` produced by
// `packages/cli/src/commands/build/features/output-md/utils.ts:94`. The
// 12-hex suffix is `sha256(content).slice(0, 12)`. Anchored to require both
// a non-empty name and a non-empty extension so we don't false-match real
// filenames that happen to contain a 12-char hex segment.
const SIGNLINK_RE = /^(.+)-([0-9a-f]{12})(\.[^.]+)$/;

// Resolves an output-path back to the stable source-path used as a key in
// `contentHashes`. Without this, two builds that differ only in include
// content would have completely different keys (`inc-abc.md` vs `inc-def.md`)
// and the consumer couldn't pair them up.
export function mapOutputToSource(outputPath: NormalizedPath, run: Run): NormalizedPath {
    const relations = run.entry.relations;

    // Identity mapping: the output filename matches a node already in the
    // graph. Covers entries, leading pages, and resources.
    if (relations.hasNode(outputPath)) {
        return outputPath;
    }

    // Try to reverse signlink: split `name-{12hex}.{ext}` and check whether
    // `name.{ext}` exists as a `source`-type node in the graph.
    const match = SIGNLINK_RE.exec(outputPath);
    if (match) {
        const [, base, , ext] = match;
        const candidate = `${base}${ext}` as NormalizedPath;
        if (relations.hasNode(candidate)) {
            const data = relations.getNodeData(candidate) as {type?: string} | undefined;
            if (data?.type === 'source') {
                return candidate;
            }
        }
    }

    // Unknown file (e.g. theme assets that aren't tracked in entry graph).
    // Identity mapping keeps the file present in `contentHashes` so the
    // consumer can still detect its changes.
    return outputPath;
}

// `Run` uses `<output>/.tmp_input/` as a scratch directory during build
// (see core/Run); those files still exist when AfterAnyRun glob's the
// output, so we filter them out explicitly to keep `contentHashes` free
// of duplicates of the real output entries.
const TMP_INPUT_PREFIX = '.tmp_input/';

// Build-artifact filenames at the output root (the artifacts the CLI
// itself emits). These would pollute `contentHashes` with self-references
// and, in some cases (crawler-manifest), with non-deterministic bytes.
const ARTIFACT_FILENAMES = new Set([
    'yfm-build-manifest.json',
    'yfm-build-stats.json',
    'yfm-build-content.json',
    'crawler-manifest.json',
    'files.json',
]);

// Matches the existing `yfm-*-meta.json` family (e.g.
// `yfm-redirects-meta-file.json`).
const META_ARTIFACT_RE = /^yfm-.+-meta.*\.json$/;

export function isExcludedServiceFile(outputPath: NormalizedPath): boolean {
    if (outputPath.startsWith(TMP_INPUT_PREFIX)) {
        return true;
    }
    if (ARTIFACT_FILENAMES.has(outputPath)) {
        return true;
    }
    return META_ARTIFACT_RE.test(outputPath);
}

// pmap insertion order is scheduler-dependent. To guarantee byte-level
// determinism in the emitted JSON, we rebuild each top-level dictionary
// with keys in alphabetical insertion order before serializing.
function sortKeys<V>(obj: Record<string, V>): Record<string, V> {
    const result: Record<string, V> = {};
    for (const key of Object.keys(obj).sort()) {
        result[key] = obj[key];
    }
    return result;
}

// Prefixing with the algorithm name lets us migrate to a different hash
// (e.g. blake3) in a schema v2 without ambiguity for the consumer.
export function hashContent(content: Buffer): string {
    return 'sha256-' + createHash('sha256').update(content).digest('hex');
}

const VOLATILE_META_KEYS = ['updatedAt', 'contributors', 'author'] as const;
const MD_FRONTMATTER_FENCE = '---\n';

// Strip VCS-injected metadata (`updatedAt`, `contributors`, `author`) from
// the frontmatter of .md files and the `meta:` block of .yaml leading
// pages before hashing.
//
// Why: with `mtimes: true`, `VcsService.metadata` injects an ISO timestamp
// into every entry's frontmatter. That timestamp is the max over the page
// AND its include deps, so any commit touching any included file shifts
// the parent's hash without changing what readers see. We hash a
// normalized view so the hash reflects content, not VCS metadata churn.
//
// Returns the raw input bytes unchanged when there's nothing to strip,
// so non-md/non-yaml files (and entries without volatile fields) keep
// their `hash == sha256(file bytes)` property.
export function normalizeForHash(content: Buffer, path: NormalizedPath): Buffer {
    if (path.endsWith('.md')) {
        return normalizeMarkdown(content);
    }
    if (path.endsWith('.yaml')) {
        return normalizeYaml(content);
    }
    return content;
}

function normalizeMarkdown(content: Buffer): Buffer {
    const text = content.toString('utf8');
    if (!text.startsWith(MD_FRONTMATTER_FENCE)) {
        return content;
    }
    // Frontmatter ends at the first `\n---\n` after the opening fence.
    const fenceEnd = text.indexOf('\n' + MD_FRONTMATTER_FENCE, MD_FRONTMATTER_FENCE.length);
    if (fenceEnd < 0) {
        return content;
    }
    const fmText = text.slice(MD_FRONTMATTER_FENCE.length, fenceEnd);
    const body = text.slice(fenceEnd + 1 + MD_FRONTMATTER_FENCE.length);

    let parsed: unknown;
    try {
        parsed = yamlLoad(fmText);
    } catch {
        return content;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return content;
    }
    const fm = parsed as Record<string, unknown>;

    const hasVolatile = VOLATILE_META_KEYS.some((k) => k in fm);
    if (!hasVolatile) {
        return content;
    }

    const stripped = stripVolatile(fm);
    if (Object.keys(stripped).length === 0) {
        return Buffer.from(body, 'utf8');
    }
    const newFm = yamlDump(stripped, {sortKeys: true});
    return Buffer.from(MD_FRONTMATTER_FENCE + newFm + MD_FRONTMATTER_FENCE + body, 'utf8');
}

function normalizeYaml(content: Buffer): Buffer {
    const text = content.toString('utf8');
    let parsed: unknown;
    try {
        parsed = yamlLoad(text);
    } catch {
        return content;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return content;
    }
    const doc = parsed as Record<string, unknown>;

    const meta = doc.meta;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
        return content;
    }
    const metaObj = meta as Record<string, unknown>;
    const hasVolatile = VOLATILE_META_KEYS.some((k) => k in metaObj);
    if (!hasVolatile) {
        return content;
    }

    const stripped = stripVolatile(metaObj);
    if (Object.keys(stripped).length === 0) {
        delete doc.meta;
    } else {
        doc.meta = stripped;
    }
    return Buffer.from(yamlDump(doc, {sortKeys: true}), 'utf8');
}

function stripVolatile(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        if (!(VOLATILE_META_KEYS as readonly string[]).includes(key)) {
            out[key] = obj[key];
        }
    }
    return out;
}

export class BuildContentMap {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('BuildContentMap', (command: Command) => {
            command.addOption(options.buildContent);
        });

        getBaseHooks(program).Config.tapPromise('BuildContentMap', async (config, args) => {
            let buildContent = false;

            if (valuable(config.buildContent)) {
                buildContent = Boolean(config.buildContent);
            }

            if (valuable(args.buildContent)) {
                buildContent = Boolean(args.buildContent);
            }

            config.buildContent = buildContent;

            return config;
        });

        getBaseHooks<Run>(program).AfterAnyRun.tapPromise('BuildContentMap', async (run) => {
            if (!run.config.buildContent) {
                return;
            }

            const pageAssets = sortKeys(collectPageAssets(run));
            const contentHashes = sortKeys(await hashOutput(run));

            const manifest: BuildContentFormat = {
                schemaVersion: SCHEMA_VERSION,
                contentHashes,
                pageAssets,
            };

            await run.write(
                join(run.output, CONTENT_MAP_FILENAME),
                JSON.stringify(manifest, null, 2),
                true,
            );
        });
    }
}

// Walks the output directory, filters out service files, and concurrently
// reads + hashes each remaining file. Keys are source-paths so two builds
// with different signlink suffixes still pair up on the consumer side.
async function hashOutput(run: Run): Promise<Record<string, ContentHashEntry>> {
    let files: NormalizedPath[];
    try {
        files = await run.glob('**/*', {cwd: run.output});
    } catch (error) {
        run.logger.warn(`BuildContentMap: failed to glob output directory: ${error}`);
        return {};
    }

    const eligible = files.filter((file) => !isExcludedServiceFile(file));
    const result: Record<string, ContentHashEntry> = {};

    // pmap with bounded concurrency — without this we'd open every output
    // file at once and trip EMFILE on large docs.
    await pmap(
        eligible,
        async (file) => {
            const abs = join(run.output, file);
            try {
                // Project's `globals.d.ts` narrows `readFile` to require an
                // encoding option; cast through unknown to call the underlying
                // Node API with no options, which returns a Buffer.
                const readFile = run.fs.readFile as unknown as (
                    path: AbsolutePath,
                ) => Promise<Buffer>;
                const content = await readFile(abs);
                const stat = await run.fs.stat(abs);
                const source = mapOutputToSource(file, run);
                result[source] = {
                    hash: hashContent(normalizeForHash(content as Buffer, file)),
                    size: stat.size,
                };
            } catch (error) {
                // File may have been removed between glob and read, or
                // permissions denied — log and skip rather than abort the
                // whole build artifact.
                run.logger.warn(`BuildContentMap: failed to hash ${file}: ${error}`);
            }
        },
        {concurrency: HASH_CONCURRENCY},
    );

    return result;
}
