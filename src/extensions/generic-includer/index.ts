import type {BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {Run as BaseRun} from '@diplodoc/cli/lib/run';
import type {
    IncluderOptions,
    RawToc,
    RawTocItem,
    TocService,
    YfmString,
} from '@diplodoc/cli/lib/toc';

import {dirname, extname, join} from 'node:path';

import {getHooks as getBaseHooks} from '@diplodoc/cli/lib/program';
import {getHooks as getTocHooks} from '@diplodoc/cli/lib/toc';

type Order = 'asc' | 'desc';
type OrderBy = 'filename' | 'natural';

type Options = IncluderOptions<{
    input?: RelativePath;
    autotitle?: boolean;
    linkIndex?: boolean;
    linkIndexAutotitle?: boolean;
    order?: Order;
    orderBy?: OrderBy;
}>;

type Graph = {
    [prop: string]: (YfmString & NormalizedPath) | Graph;
};

type Run = BaseRun & {
    toc?: TocService;
};

const EXTENSION = 'GenericIncluder';
const INCLUDER = 'generic';

const naturalCollator = new Intl.Collator(undefined, {numeric: true});

export class Extension implements IExtension {
    apply(program: BaseProgram) {
        getBaseHooks<Run>(program).BeforeAnyRun.tap(EXTENSION, (run) => {
            getTocHooks(run.toc)
                .Includer.for(INCLUDER)
                .tapPromise(EXTENSION, async (toc, options: Options) => {
                    const input = dirname(options.path);
                    const files = await run.glob('**/*.md', {
                        cwd: join(run.input, input),
                    });

                    return fillToc(toc, graph(files), options);
                });
        });
    }
}

function graph(paths: NormalizedPath[]): Graph {
    const graph: Graph = {};

    for (const path of paths) {
        const chunks: string[] = path.split('/');

        let level: Hash = graph;
        while (chunks.length) {
            const field = chunks.shift() as string;

            if (chunks.length) {
                level[field] = level[field] || {};
                level = level[field];
            } else {
                level[field.replace(extname(field), '')] = path;
            }
        }
    }

    return graph;
}

function pageName(key: string, options: Options) {
    if (options.autotitle !== false) {
        return undefined;
    }

    return key as YfmString;
}

function compareKeys(orderBy: OrderBy): (a: string, b: string) => number {
    if (orderBy === 'filename') {
        return (a, b) => {
            if (a < b) return -1;
            if (a > b) return 1;
            return 0;
        };
    }

    return naturalCollator.compare;
}

function sortEntries<T>(entries: [string, T][], options: Options): [string, T][] {
    if (!options.orderBy) {
        return entries;
    }

    const cmp = compareKeys(options.orderBy);
    const direction = (options.order ?? 'asc') === 'desc' ? -1 : 1;

    return [...entries].sort(([a], [b]) => direction * cmp(a, b));
}

function fillToc(toc: RawToc, graph: Graph, options: Options) {
    function item([key, value]: [string, Graph | (NormalizedPath & YfmString)]): RawTocItem {
        const name = pageName(key, options);

        if (typeof value === 'string') {
            return {name, href: value};
        }

        const entries = sortEntries(Object.entries(value), options);

        if (options.linkIndex) {
            const indexEntry = entries.find(([k]) => k === 'index');
            const childEntries = entries.filter(([k]) => k !== 'index');
            const indexHref =
                indexEntry && typeof indexEntry[1] === 'string' ? indexEntry[1] : undefined;

            if (indexHref) {
                const useIndexHeading =
                    options.linkIndexAutotitle === true && options.autotitle !== false;

                if (useIndexHeading) {
                    return {
                        href: indexHref,
                        items: childEntries.map(item),
                    };
                }

                return {
                    name: key as YfmString,
                    href: indexHref,
                    items: childEntries.map(item),
                };
            }

            return {
                name: key as YfmString,
                items: childEntries.map(item),
            };
        }

        return {name: key as YfmString, items: entries.map(item)};
    }

    toc.items = sortEntries(Object.entries(graph), options).map(item);

    return toc;
}
