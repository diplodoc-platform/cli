/* eslint-disable no-shadow */
import {join} from 'path';

import parser from '@apidevtools/swagger-parser';

import parsers from './parsers';
import generators from './generators';

import {
    YfmToc,
    IncluderFnParams,
    IncluderFnOutput,
} from '../../../../models';
import {Info, Tag} from './types';

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
    const tags: Map<string, Tag> = parsers.paths(data, parsers.tags(data));

    const main: string = generators.main(info, tags);

    results.push({
        path: join(root, includePath, 'index.md'),
        content: main,
    });

    tags.forEach((tag, id) => {
        const path = join(root, includePath, id, 'index.md');
        const content = generators.section(tag);

        results.push({path, content});

        const {endpoints} = tag;
        if (!endpoints) { return; }

        endpoints.forEach((endpoint) => {
            const path = join(root, includePath, id, endpoint.id + '.md');
            const content = generators.endpoint(endpoint);

            results.push({path, content});
        });
    });

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

    const tags: Map<string, Tag> = parsers.paths(data, parsers.tags(data));

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
            const path = join(id, endpoint.id + '.md');

            section.items.push({
                href: path,
                name: endpoint.summary ?? endpoint.id,
            } as YfmToc);
        });

        result.content.items.push(section);
    });

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

const name = 'openapi';

export {
    name,
    generateTocs,
    generateContent,
    generateLeadingPages,
    generatePath,
};
