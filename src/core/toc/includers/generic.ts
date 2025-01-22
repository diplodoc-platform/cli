import type {Build} from '~/commands';
import type {IncluderOptions, RawToc, RawTocItem, YfmString} from '~/core/toc';

import {dirname, extname, join} from 'node:path';

// const AUTOTITLE = '{$T}';

type Options = IncluderOptions<{
    input?: RelativePath;
    autotitle?: boolean;
    leadingPage?: {
        autotitle?: boolean;
        name?: string;
    };
}>;

type Graph = {
    [prop: string]: (YfmString & NormalizedPath) | Graph;
};

// TODO: implement autotitle after md refactoring
// TODO: implement sort
export class GenericIncluderExtension {
    apply(program: Build) {
        program.hooks.BeforeAnyRun.tap('GenericIncluder', (run) => {
            run.toc.hooks.Includer.for('generic').tapPromise(
                'GenericIncluder',
                async (toc, options: Options, path) => {
                    const input = options.input
                        ? join(dirname(path), options.input)
                        : dirname(options.path);
                    const files = await run.glob('**/*.md', {
                        cwd: join(run.input, input),
                    });

                    return fillToc(toc, graph(files), options);
                },
            );
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
    if (key === 'index') {
        // if (options?.leadingPage?.autotitle) {
        //     return AUTOTITLE;
        // }

        // TODO: i18n
        return (options?.leadingPage?.name ?? 'Overview') as YfmString;
    }

    // return options.autotitle ? AUTOTITLE : key;
    return key as YfmString;
}

function fillToc(toc: RawToc, graph: Graph, options: Options) {
    function item([key, value]: [string, Graph | (NormalizedPath & YfmString)]): RawTocItem {
        const name = pageName(key, options);

        if (typeof value === 'string') {
            return {name, href: value};
        }

        return {name, items: Object.entries(value).map(item)};
    }

    toc.items = Object.entries(graph).map(item);

    return toc;
}
