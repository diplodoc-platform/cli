import type {Collect, IncludeInfo, Location} from '~/core/markdown';
import type {Alternate} from '~/core/meta';

import {dirname, extname, relative} from 'node:path';
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

/**
 * Builds an llms.txt alternate link entry for the frontmatter / HTML `<head>`.
 *
 * - If `llms.url` is set — uses it as the absolute href (takes priority).
 * - If `llms.enabled` is true — uses a relative href to `llms.txt` in the toc directory,
 *   computed from the article's location (e.g. `../llms.txt` for a page in a subdirectory).
 * - Otherwise — returns `null` (no llms.txt link).
 *
 * @param llmsConfig - Normalized llms config from `run.config.llms`
 * @param file - Normalized document path (e.g. `ru/deep/test.md`)
 * @param tocDir - Directory of the toc that owns the file (e.g. `ru`)
 * @returns Alternate link object for llms.txt, or null when llms is disabled
 */
export function buildLlmsAlternate(
    llmsConfig:
        | {
              enabled?: boolean;
              url?: string;
          }
        | undefined,
    file: NormalizedPath,
    tocDir: NormalizedPath,
): Alternate | null {
    if (llmsConfig?.url) {
        return {
            href: llmsConfig.url,
            type: 'text/markdown',
            title: 'llms.txt',
        };
    }

    if (llmsConfig?.enabled) {
        // llms.txt sits in the toc directory; compute a relative path from the article.
        const rel = relative(dirname(file), tocDir);
        const href = rel ? `${rel}/llms.txt` : 'llms.txt';
        return {
            href,
            type: 'text/markdown',
            title: 'llms.txt',
        };
    }

    return null;
}

/**
 * Builds all alternate link entries (companion + llms.txt) for a document.
 *
 * Include files (`_includes/`) are skipped — they are not standalone articles
 * and should not carry companion or llms.txt links.
 *
 * @param file - Normalized document path (e.g. `ru/about.md`)
 * @param tocDir - Directory of the toc that owns the file (e.g. `ru`)
 * @param llmsConfig - Normalized llms config from `run.config.llms`
 * @returns Array of Alternate entries (may be empty)
 */
export function buildAlternateEntries(
    file: NormalizedPath,
    tocDir: NormalizedPath,
    llmsConfig: {enabled?: boolean; url?: string} | undefined,
): Alternate[] {
    // Include files are not part of any toc — skip companion and llms links.
    if (file.includes('/_includes/') || file.startsWith('_includes/')) {
        return [];
    }

    const entries: Alternate[] = [buildCompanionAlternate(file)];

    const llmsAlternate = buildLlmsAlternate(llmsConfig, file, tocDir);
    if (llmsAlternate) {
        entries.push(llmsAlternate);
    }

    return entries;
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
