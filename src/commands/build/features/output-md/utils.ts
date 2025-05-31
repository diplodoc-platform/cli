import type {Collect, EntryGraph} from '~/core/markdown';

import {createHash} from 'node:crypto';
import * as mermaid from '@diplodoc/mermaid-extension';
import * as latex from '@diplodoc/latex-extension';
import * as pageConstructor from '@diplodoc/page-constructor-extension';

import {replaceAll} from '~/core/utils';

type Plugin = {
    collect?: Collect;
};

type HashedGraph = EntryGraph & {
    link: string;
    match: string;
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

export function replaceDeps(content: string, deps: HashedGraph[]) {
    deps = deps.slice();

    let index = 0;
    while (deps.length && index > -1) {
        const dep = deps.shift() as HashedGraph;
        const start = content.indexOf(dep.match, index);
        const end = start + dep.match.length;

        if (start > -1) {
            const rehashed = rehashInclude(dep);
            content = content.slice(0, start) + rehashed + content.slice(end);
            index = start + rehashed.length - 1;
        }
    }

    return content;
}

export function rehashContent(content: string) {
    const hash = createHash('sha256');

    hash.update(content);

    return hash.digest('hex').slice(0, 12);
}

export function rehashInclude(include: HashedGraph) {
    return replaceAll(include.match, include.link, signlink(include.link, include.hash));
}

export function signlink(link: string, sign: string) {
    if (!sign) {
        return link;
    }

    const [path, hash] = link.split('#');
    const [_, name, ext] = path.match(/(.*)\.(.*?)$/) as string[];

    return `${name}-${sign}.${ext}${hash ? '#' + hash : ''}`;
}
