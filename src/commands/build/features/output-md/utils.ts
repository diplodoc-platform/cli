import type {Collect, IncludeInfo, Location} from '~/core/markdown';
import type {Alternate} from '~/core/meta';

import {extname} from 'node:path';
import {createHash} from 'node:crypto';
import {dump as yamlDump} from 'js-yaml';
import * as mermaid from '@diplodoc/mermaid-extension';
import * as latex from '@diplodoc/latex-extension';
import * as pageConstructor from '@diplodoc/page-constructor-extension';

import {setExt, shortLink} from '~/core/utils';

/**
 * Adds YAML frontmatter to markdown content.
 *
 * @param content - Markdown content
 * @param meta - Metadata object to serialize as YAML frontmatter
 * @param lineWidth - Maximum line width for YAML dump (undefined = default)
 * @returns Content with YAML frontmatter prepended, or original content if meta is empty
 */
export function addMetaFrontmatter(
    content: string,
    meta: Hash,
    lineWidth: number | undefined,
): string {
    const dumped = yamlDump(meta, {lineWidth}).trim();
    if (dumped === '{}') {
        return content;
    }
    return `---\n${dumped}\n---\n${content}`;
}

/**
 * Builds a companion alternate link entry for a document path.
 *
 * For `.md` files → `{type: 'text/markdown', title: 'Markdown version'}`.
 * For `.yaml`/`.yml` files → `{type: 'application/yaml', title: 'Yaml version'}`.
 *
 * The href is a relative short link to the companion file (same path, same extension),
 * which the viewer resolves to an absolute companion URL at serve time.
 *
 * @param file - Normalized document path (e.g. `ru/about.md`, `ru/index.yaml`)
 * @returns Alternate link object for the companion
 */
export function buildCompanionAlternate(file: NormalizedPath): Alternate {
    const companionExt = file.endsWith('.yaml') || file.endsWith('.yml') ? 'yaml' : 'md';
    const companionHref = shortLink(setExt(file, companionExt));
    return {
        href: companionHref,
        type: companionExt === 'yaml' ? 'application/yaml' : 'text/markdown',
        title: companionExt === 'yaml' ? 'Yaml version' : 'Markdown version',
    };
}

type Plugin = {
    collect?: Collect;
};

export type StepFunction = {
    (scheduler: Scheduler, path: NormalizedPath): Promise<void>;
};

export type StepActor<Context extends Hash = Hash> = {
    (content: string, context: Context): Promise<string>;
};

export type HashedGraphNode = IncludeInfo & {
    content: string;
    hash: string;
    deps: HashedGraphNode[];
};

// TODO(major): Deprecate
export function getCustomCollectPlugins(): Collect[] {
    try {
        const plugins: Plugin[] = require(require.resolve('./plugins'));

        const collects = (
            [
                mermaid.transform({
                    bundle: false,
                    runtime: '_bundle/mermaid-extension.js',
                }),
                latex.transform({
                    bundle: false,
                    runtime: {
                        script: '_bundle/latex-extension.js',
                        style: '_bundle/latex-extension.css',
                    },
                }),
                pageConstructor.transform({
                    bundle: false,
                    runtime: {
                        script: '_bundle/page-constructor-extension.js',
                        style: '_bundle/page-constructor-extension.css',
                    },
                }),
            ] as Plugin[]
        )
            .concat(plugins || [])
            .map((plugin) => plugin.collect);

        return collects.filter(Boolean) as Collect[];
    } catch {
        return [];
    }
}

export function rehashContent(content: string) {
    const hash = createHash('sha256');

    hash.update(content);

    return hash.digest('hex').slice(0, 12);
}

export function signlink(link: string, sign: string) {
    if (!sign) {
        return link;
    }

    const [path, hash] = link.split('#');
    const ext = extname(path);
    const name = setExt(path, '');

    return `${name}-${sign}${ext}${hash ? '#' + hash : ''}`;
}

export class Scheduler {
    private entries: Array<[Location, StepActor, Hash]> = [];

    private steps: Array<StepFunction>;

    constructor(steps: (StepFunction | false | undefined)[]) {
        this.steps = steps.filter(Boolean) as StepFunction[];
    }

    add<Context extends Hash>(
        location: Location,
        actor: StepActor<Context>,
        context: Context,
    ): void {
        this.entries.push([location, actor as StepActor, context]);
    }

    async schedule(entry: NormalizedPath): Promise<void> {
        for (const step of this.steps) {
            await step(this, entry);
        }
        this.entries.sort((a, b) => b[0][0] - a[0][0]);
    }

    async process(content: string): Promise<string> {
        if (this.entries.length === 0) {
            return content;
        }

        for (const [_, actor, context] of this.entries) {
            content = await actor(content, context);
        }
        return content;
    }
}
