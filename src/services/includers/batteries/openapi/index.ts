/* eslint-disable no-shadow */
import {join} from 'path';

import parser from '@apidevtools/swagger-parser';

import parsers from './parsers';
import generators from './generators';

import {
    YfmToc,
    IncluderFnParams,
    IncluderFnOutput,
    IncluderFnOutputElement,
} from '../../../../models';
import {Endpoint, Info} from './types';

async function generateContent(params: IncluderFnParams): IncluderFnOutput {
    const {
        include: {path},
        root,
    } = params;

    const includePath = fixpath(path);

    let data;

    try {
        data = await parser.validate(join(root, path), {validate: {spec: true}});
    } catch (e) {
        throw Error('includer openapi: failed to parse specification');
    }

    const results = [];

    const info: Info = parsers.info(data);
    const spec = parsers.paths(data, parsers.tags(data));

    const main: string = generators.main(info, spec);

    results.push({
        path: join(root, includePath, 'index.md'),
        content: main,
    });

    spec.tags.forEach((tag, id) => {
        const path = join(root, includePath, id, 'index.md');
        const content = generators.section(tag);

        results.push({path, content});

        const {endpoints} = tag;
        if (!endpoints) { return; }

        endpoints.forEach((endpoint) => {
            results.push(handleEndpointIncluder(endpoint, join(root, includePath, id)));
        });
    });

    for (const endpoint of spec.endpoints) {
        results.push(handleEndpointIncluder(endpoint, join(root, includePath)));
    }

    return results;
}

async function generateTocs(params: IncluderFnParams): IncluderFnOutput {
    const {
        name,
        include: {path},
        root,
    } = params;

    let data;

    try {
        data = await parser.validate(join(root, path), {validate: {spec: true}});

    } catch (e) {
        throw Error('includer openapi: failed to parse specification');
    }

    const includePath = fixpath(path);

    const result = {
        path: join(root, includePath, 'toc.yaml'),
        content: {
            name,
            href: 'index.yaml',
            items: [
                {
                    hidden: true,
                    name: 'index',
                    href: 'index.md',
                } as unknown as YfmToc,
            ],
        } as YfmToc,
    };

    const {tags, endpoints} = parsers.paths(data, parsers.tags(data));

    tags.forEach((tag, id) => {
        const {name, endpoints} = tag;

        const section: YfmToc = {
            name,
            items: [{
                hidden: true,
                name: 'index',
                href: join(id, 'index.md'),
            } as unknown as YfmToc],
        } as YfmToc;

        if (!endpoints) { return; }

        endpoints.forEach((endpoint) => {
            section.items.push(handleEndpointRender(endpoint, id));
        });

        result.content.items.push(section);
    });

    for (const endpoint of endpoints) {
        result.content.items.push(handleEndpointRender(endpoint));
    }

    return [result];
}

async function generateLeadingPages(
    params: IncluderFnParams,
): IncluderFnOutput {
    const {
        name,
        include: {path},
        root,
    } = params;

    const includePath = fixpath(path);

    return [
        {
            path: join(root, includePath, 'index.yaml'),
            content: {
                title: name,
                links: [
                    {title: 'index', href: 'index.md'},
                ],
            },
        },
    ];
}

async function generatePath(params: IncluderFnParams): Promise<string> {
    return join(fixpath(params.include.path), 'toc.yaml');
}

function fixpath(path: string) {
    return path.replace(/\.[^.]+$/gmu, '');
}

function handleEndpointIncluder(endpoint: Endpoint, pathPrefix: string): IncluderFnOutputElement {
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

const name = 'openapi';

export {
    name,
    generateTocs,
    generateContent,
    generateLeadingPages,
    generatePath,
};
