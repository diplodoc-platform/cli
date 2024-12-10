import type { Build } from '~/commands';
import type { IncluderOptions, RawToc, RawTocItem, Run, YfmString } from '~/commands/build';

import {dirname, extname, join, normalize} from 'node:path';

const AUTOTITLE = '{$T}';

type Options = IncluderOptions<{
    input?: RelativePath;
    autotitle?: boolean;
    leadingPage?: {
        autotitle?: boolean;
        name?: string;
    };
}>;

type Graph = {
    [prop: string]: string | Graph;
};

// TODO: implement autotitle after md refactoring
// TODO: implement sort
export class GenericIncluderExtension {
    apply(program: Build) {
        program.hooks.BeforeAnyRun.tap('GenericIncluder', (run: Run) => {
            run.toc.hooks.Includer.for('generic').tapPromise('GenericIncluder', async (toc: RawToc, options: Options, path: RelativePath) => {
                const input = options.input ? join(dirname(path), options.input) : path;
                const files = await run.glob('**/*.md', {
                    cwd: join(run.input, input),
                });

                return fillToc(toc, graph(files), options);
            });
        });
    }
}

function graph(paths: RelativePath[]): Graph {
    const graph: Graph = {};

    for (const path of paths) {
        const chunks: string[] = normalize(path)
            .replace(/\\/g, '/')
            .split('/');

        let level: Hash = graph;
        while (chunks.length) {
            const field = chunks.shift() as string;

            if (!chunks.length) {
                level[field.replace(extname(field), '')] = path;
            } else {
                level[field] = level[field] || {};
                level = level[field];
            }
        }
    }

    return graph;
}

function pageName(key: string, options: Options) {
    if (key === 'index') {
        if (options?.leadingPage?.autotitle) {
            return AUTOTITLE;
        }

        return options?.leadingPage?.name ?? 'Overview';
    }

    return options.autotitle ? AUTOTITLE : key;
}

function fillToc(toc: RawToc, graph: Graph, options: Options) {
    function item([key, value]: [string, Graph | string]): RawTocItem {
        const name: YfmString = pageName(key, options);

        if (typeof value === 'string') {
            return {name, href: value};
        }

        return {name, items: Object.entries(value).map(item)}
    }

    toc.items = Object.entries(graph).map(item);

    return toc;
}
