import {mkdir, readFile, writeFile} from 'fs/promises';
import {dirname, join, parse} from 'path';

import {updateWith} from 'lodash';
import {dump} from 'js-yaml';

import {glob} from '../../../utils/glob';

import {IncluderFunctionParams} from '../../../models';

class GenericIncluderError extends Error {
    path: string;

    constructor(message: string, path: string) {
        super(message);

        this.name = 'GenericIncluderError';
        this.path = path;
    }
}

const name = 'generic';

const MD_GLOB = '**/*.md';

type Params = {
    input: string;
    leadingPage: {
        name?: string;
    };
};

async function includerFunction(params: IncluderFunctionParams<Params>) {
    const {
        readBasePath,
        writeBasePath,
        tocPath,
        item,
        passedParams: {input, leadingPage},
        index,
    } = params;

    if (!input?.length || !item.include?.path) {
        throw new GenericIncluderError('provide includer with input parameter', tocPath);
    }

    try {
        const leadingPageName = leadingPage?.name ?? 'Overview';

        const tocDirPath = dirname(tocPath);

        const contentPath =
            index === 0
                ? join(writeBasePath, tocDirPath, input)
                : join(readBasePath, tocDirPath, input);

        let cache = {};
        let found = [];

        ({
            state: {found, cache},
        } = await glob(MD_GLOB, {
            cwd: contentPath,
            nosort: true,
            nocase: true,
            cache,
        }));

        const writePath = join(writeBasePath, tocDirPath, item.include.path);

        await mkdir(writePath, {recursive: true});

        for (const filePath of found) {
            const file = await readFile(join(contentPath, filePath));

            await mkdir(dirname(join(writePath, filePath)), {recursive: true});
            await writeFile(join(writePath, filePath), file);
        }

        const graph = createGraphFromPaths(found);

        const toc = createToc(leadingPageName, item.include.path)(graph, []);

        await writeFile(join(writePath, 'toc.yaml'), dump(toc));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        throw new GenericIncluderError(message, tocPath);
    }
}

function createGraphFromPaths(paths: string[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const graph: Record<string, any> = {};

    for (const path of paths) {
        const chunks = path.split('/').filter(Boolean);
        if (chunks.length < 2) {
            if (chunks.length === 1) {
                graph.files = graph.files ? graph.files.concat(chunks[0]) : chunks;
            }

            continue;
        }

        const file = chunks.pop();

        updateWith(
            graph,
            chunks,
            (old) => {
                return old ? {files: [...old.files, file]} : {files: [file]};
            },
            Object,
        );
    }

    return graph;
}

function createToc(leadingPageName: string, tocName: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function createTocRec(
        graph: Record<string, any>,
        cursor: string[],
    ): Record<string, any> {
        const handler = (file: string) => ({
            name: parse(file).name === 'index' ? leadingPageName : file,
            href: join(...cursor, file),
        });

        const recurse = (key: string) => createTocRec(graph[key], [...cursor, key]);

        const current = {
            name: cursor[cursor.length - 1] ?? tocName,
            items: [
                ...(graph.files ?? []).map(handler),
                ...Object.keys(graph)
                    .filter((key) => key !== 'files')
                    .map(recurse),
            ],
        };

        return current;
    };
}

export {name, includerFunction};

export default {name, includerFunction};
