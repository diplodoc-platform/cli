import type {Command} from '~/core/config';
import type {Build, Run} from '~/commands/build';

import {createHash} from 'node:crypto';

import {getHooks as getBaseHooks} from '~/core/program';
import {valuable} from '~/core/config';

import {options} from './config';

export const CONTENT_MAP_FILENAME = 'yfm-build-content.json';
export const SCHEMA_VERSION = 1;

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

// Filter is anchored: only matches top-level `yfm-build-*.json` or
// `yfm-*-meta*.json`. Subdir matches (`ru/yfm-build-manifest.json`) are
// user content and must be preserved.
const SERVICE_FILE_RE = /^yfm-(?:build-.+|.+-meta.*)\.json$/;

export function isExcludedServiceFile(outputPath: NormalizedPath): boolean {
    return SERVICE_FILE_RE.test(outputPath);
}

// Prefixing with the algorithm name lets us migrate to a different hash
// (e.g. blake3) in a schema v2 without ambiguity for the consumer.
export function hashContent(content: Buffer): string {
    return 'sha256-' + createHash('sha256').update(content).digest('hex');
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
            // Implementation arrives in later tasks.
        });
    }
}
