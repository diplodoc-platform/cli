import type {Collect, IncludeInfo, Location} from '~/core/markdown';

import {extname} from 'node:path';
import {createHash} from 'node:crypto';
import * as mermaid from '@diplodoc/mermaid-extension';
import * as latex from '@diplodoc/latex-extension';
import * as pageConstructor from '@diplodoc/page-constructor-extension';

import {setExt} from '~/core/utils';

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
    } catch (e) {
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
