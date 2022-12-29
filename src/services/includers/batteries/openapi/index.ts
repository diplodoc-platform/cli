import {resolve, join, dirname} from 'path';
import {mkdir, writeFile} from 'fs/promises';

import parser from '@apidevtools/swagger-parser';
import {dump} from 'js-yaml';

import parsers from './parsers';
import generators from './generators';

import {IncluderFunctionParams, YfmToc} from '../../../../models';
import {Endpoint, Info} from './types';

const name = 'openapi';

class OpenApiIncluderError extends Error {
    path: string;

    constructor(message: string, path: string) {
        super(message);

        this.name = 'OpenApiIncluderError';
        this.path = path;
    }
}

async function includerFunction(params: IncluderFunctionParams) {
    const {readBasePath, writeBasePath, tocPath, passedParams: {input, leadingPage}, index} = params;

    const tocDirPath = dirname(tocPath);

    const contentPath = index === 0
        ? resolve(process.cwd(), writeBasePath, input)
        : resolve(process.cwd(), readBasePath, input);

    const leadingPageName = leadingPage?.name ?? 'Overview';

    let data;

    try {
        data = await parser.validate(contentPath, {validate: {spec: true}});
    } catch (err) {
        if (err instanceof Error) {
            throw new OpenApiIncluderError(err.toString(), tocPath);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const writePath = join(writeBasePath, tocDirPath, params.item.include!.path);

    try {
        await mkdir(writePath, {recursive: true});
        await generateToc(data, writePath, leadingPageName);
        await generateContent(data, writePath);
    } catch (err) {
        if (err instanceof Error) {
            throw new OpenApiIncluderError(err.toString(), tocPath);
        }
    }
}

async function generateToc(data: any, writePath: string, leadingPageName: string): Promise<any> {
    const toc = {
        name,
        items: [
                {
                    name: leadingPageName,
                    href: 'index.md',
                } as unknown as YfmToc,
        ],
    } as YfmToc;

    const {tags, endpoints} = parsers.paths(data, parsers.tags(data));

    tags.forEach((tag, id) => {
        const {name, endpoints} = tag;

        const section: YfmToc = {
            name,
            items: [{
                name: leadingPageName,
                href: join(id, 'index.md'),
            } as unknown as YfmToc],
        } as YfmToc;

        if (!endpoints) { return; }

        endpoints.forEach((endpoint) => {
            section.items.push(handleEndpointRender(endpoint, id));
        });

        toc.items.push(section);
    });

    for (const endpoint of endpoints) {
        toc.items.push(handleEndpointRender(endpoint));
    }

    await mkdir(dirname(writePath), {recursive: true});
    await writeFile(join(writePath, 'toc.yaml'), dump(toc));
}

async function generateContent(data: any, writePath: string): Promise<void> {
    const results = [];

    const info: Info = parsers.info(data);
    const spec = parsers.paths(data, parsers.tags(data));

    const main: string = generators.main(info, spec);

    results.push({
        path: join(writePath, 'index.md'),
        content: main,
    });

    spec.tags.forEach((tag, id) => {
        const path = join(writePath, id, 'index.md');
        const content = generators.section(tag);

        results.push({path, content});

        const {endpoints} = tag;
        if (!endpoints) { return; }

        endpoints.forEach((endpoint) => {
            results.push(handleEndpointIncluder(endpoint, join(writePath, id)));
        });
    });

    for (const endpoint of spec.endpoints) {
        results.push(handleEndpointIncluder(endpoint, join(writePath)));
    }

    for (const {path, content} of results) {
        await mkdir(dirname(path), {recursive: true});
        await writeFile(path, content);
    }
}

function handleEndpointIncluder(endpoint: Endpoint, pathPrefix: string) {
    const path = join(pathPrefix, mdPath(endpoint));
    const content = generators.endpoint(endpoint);

    return {path, content};
}

function handleEndpointRender(endpoint: Endpoint, pathPrefix?: string): YfmToc {
    let path = mdPath(endpoint);
    if (pathPrefix) {
        path = join(pathPrefix, path);
    }
    return {
        href: path,
        name: sectionName(endpoint),
    } as YfmToc;
}

export function sectionName(e: Endpoint): string {
    return e.summary ?? e.operationId ?? `${e.method} ${e.path}`;
}

export function mdPath(e: Endpoint): string {
    return `${e.id}.md`;
}

export {name, includerFunction};

export default {name, includerFunction};
