import assert from 'assert';
import {resolve, join, dirname} from 'path';
import {mkdir, writeFile} from 'fs/promises';

import {dump} from 'js-yaml';

import parsers from './parsers';
import generators from './generators';

import {IncluderFunctionParams, YfmToc} from '../../../../models';
import SwaggerParser from '@apidevtools/swagger-parser';
import {JSONSchema6} from 'json-schema';

import {SPEC_RENDER_MODE_DEFAULT, SPEC_RENDER_MODE_HIDDEN} from './constants';

import {Endpoint, Info, Refs, OpenApiIncluderParams} from './types';

const name = 'openapi';

class OpenApiIncluderError extends Error {
    path: string;

    constructor(message: string, path: string) {
        super(message);

        this.name = 'OpenApiIncluderError';
        this.path = path;
    }
}

async function includerFunction(params: IncluderFunctionParams<OpenApiIncluderParams>) {
    const {readBasePath, writeBasePath, tocPath, passedParams: {input, leadingPage = {}, sandbox}, index} = params;

    const tocDirPath = dirname(tocPath);

    const contentPath = index === 0
        ? resolve(process.cwd(), writeBasePath, input)
        : resolve(process.cwd(), readBasePath, input);

    let data;

    const parser = new SwaggerParser();
    try {
        data = await parser.validate(contentPath, {validate: {spec: true}});
    } catch (err) {
        if (err instanceof Error) {
            throw new OpenApiIncluderError(err.toString(), tocPath);
        }
    }

    const allRefs: Refs = {};
    for (const file of Object.values(parser.$refs.values())) {
        for (const [refName, schema] of Object.entries(file.components?.schemas || {}).concat(Object.entries(file))) {
            allRefs[refName] = schema as JSONSchema6;
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const writePath = join(writeBasePath, tocDirPath, params.item.include!.path);

    try {
        await mkdir(writePath, {recursive: true});
        await generateToc({data, writePath, leadingPage});
        await generateContent({data, allRefs, writePath, leadingPage, sandbox});
    } catch (error) {
        if (error && !(error instanceof OpenApiIncluderError)) {
            // eslint-disable-next-line no-ex-assign
            error = new OpenApiIncluderError(error.toString(), tocPath);
        }

        throw error;
    }
}

// TODO: revrite on schema validation
function assertSpecRenderMode(mode: string) {
    const options: string[] = [SPEC_RENDER_MODE_DEFAULT, SPEC_RENDER_MODE_HIDDEN];
    const isValid = options.includes(mode);

    assert(isValid, `invalid spec display mode ${mode}, available options:${options.join(', ')}`);
}

export type generateTocParams = {
    data: any;
    writePath: string;
    leadingPage: OpenApiIncluderParams['leadingPage'];
    leadingPageName: string;
};

async function generateToc(params: generateTocParams): Promise<any> {
    const {data, writePath, leadingPage} = params;
    const leadingPageName = leadingPage?.name ?? 'Overview';

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

export type generateContentParams = {
    data: any;
    writePath: string;
    allRefs: Refs;
    leadingPage: OpenApiIncluderParams['leadingPage'];
    sandbox?: {
        tabName?: string;
        host?: string;
    };
};

async function generateContent(params: generateContentParams): Promise<void> {
    const {data, writePath, allRefs, leadingPage, sandbox} = params;

    const leadingPageSpecRenderMode = leadingPage?.spec?.renderMode ?? SPEC_RENDER_MODE_DEFAULT;
    assertSpecRenderMode(leadingPageSpecRenderMode);

    const results = [];

    const info: Info = parsers.info(data);
    const spec = parsers.paths(data, parsers.tags(data));

    const main: string = generators.main({data, info, spec, leadingPageSpecRenderMode});

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
            results.push(handleEndpointIncluder(allRefs, endpoint, join(writePath, id), sandbox));
        });
    });

    for (const endpoint of spec.endpoints) {
        results.push(handleEndpointIncluder(allRefs, endpoint, join(writePath), sandbox));
    }

    for (const {path, content} of results) {
        await mkdir(dirname(path), {recursive: true});
        await writeFile(path, content);
    }
}

function handleEndpointIncluder(allRefs: Refs, endpoint: Endpoint, pathPrefix: string, sandbox: {host?: string} | undefined) {
    const path = join(pathPrefix, mdPath(endpoint));
    const content = generators.endpoint(allRefs, endpoint, sandbox);

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
