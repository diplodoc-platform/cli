import {writeFile, mkdir} from 'fs/promises';
import {resolve, parse, join, dirname, relative} from 'path';

import {updateWith} from 'lodash';
import {dump} from 'js-yaml';

import {glob} from '../../../utils/glob';

import {IncluderFunctionParams} from '../../../models';

class SourceDocsIncluderError extends Error {
    path: string;

    constructor(message: string, path: string) {
        super(message);

        this.name = 'SourceDocsIncluderError';
        this.path = path;
    }
}

const name = 'sourcedocs';

const MD_GLOB = '**/*.md';

async function includerFunction(params: IncluderFunctionParams) {
    const {readBasePath, writeBasePath, tocPath, item, passedParams: {input, leadingPage}} = params;

    if (!input?.length) {
        throw new SourceDocsIncluderError('provide includer with input parameter', tocPath);
    }

    const tocDirPath = dirname(tocPath);

    const contentPath = resolve(process.cwd(), readBasePath, input);

    let cache = {};
    let found = [];

    ({state: {found, cache}} = await glob(join(contentPath, MD_GLOB), {
        nosort: true,
        nocase: true,
        cache,
    }));

    const pattern = `^${readBasePath}`;
    const flags = 'mui';
    const regexp = new RegExp(pattern, flags);

    const relatives = found
        .map((path: string) => path.replace(regexp, ''))
        .filter(Boolean);

    const graph = createGraphFromPaths(relatives);

    const graphKeys = Object.keys(graph);

    if (!graphKeys.length) {
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-shadow
    function createTocFromGraph(graph: Record<string, any>, cursor: string[]): Record<string, any> {
        const currentHandler = (file: string) => ({
            name: parse(file).name === 'index' ? (leadingPage?.name ?? 'Overview') : file,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            href: relative(join(tocDirPath, item.include!.path), join(...cursor, file)),
        });

        const recursiveHandler = ((key: string) => createTocFromGraph(graph[key], [...cursor, key]));

        return {
            name: cursor[cursor.length - 1],
            items: [
                ...(graph.files ?? []).map(currentHandler),
                ...Object.keys(graph).filter((key) => key !== 'files').map(recursiveHandler),
            ],
        };
    }

    const toc = createTocFromGraph(graph[graphKeys[0]], [graphKeys[0]]);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const writePath = join(writeBasePath, tocDirPath, params.item.include!.path);

    await mkdir(writePath, {recursive: true});

    await writeFile(join(writePath, 'toc.yaml'), dump(toc));
}

function createGraphFromPaths(paths: string[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const graph: Record<string, any> = {};

    for (const path of paths) {
        const chunks = path.split('/').filter(Boolean);
        if (chunks.length < 2) {
            continue;
        }

        const file = chunks.pop();

        updateWith(graph, chunks, (old) => {
            return old ? {files: [...old.files, file]} : {files: [file]};
        }, Object);
    }

    return graph;
}

export {name, includerFunction};
