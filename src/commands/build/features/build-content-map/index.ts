import type {Command} from '~/core/config';
import type {Build, Run} from '~/commands/build';

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
