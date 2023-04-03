import assert from 'assert';
import {resolve, join, dirname} from 'path';
import {mkdir, writeFile} from 'fs/promises';
import {evalExp} from '@doc-tools/transform/lib/liquid/evaluation';

import {dump} from 'js-yaml';

import parsers from './parsers';
import generators from './generators';

import {IncluderFunctionParams, YfmPreset, YfmToc, YfmTocItem} from '../../../../models';
import SwaggerParser from '@apidevtools/swagger-parser';
import {JSONSchema6} from 'json-schema';

import {SPEC_RENDER_MODE_DEFAULT, SPEC_RENDER_MODE_HIDDEN} from './constants';

import {Endpoint, Info, Refs, Specification, Tag, LeadingPageMode, OpenApiIncluderParams} from './types';

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
    const {readBasePath, writeBasePath, tocPath, vars, passedParams: {input, leadingPage = {}, filter = {}, sandbox}, index} = params;

    const tocDirPath = dirname(tocPath);

    const contentPath = index === 0
        ? resolve(process.cwd(), writeBasePath, input)
        : resolve(process.cwd(), readBasePath, input);

    const parser = new SwaggerParser();

    try {
        const data = await parser.validate(contentPath, {validate: {spec: true}});

        const allRefs: Refs = {};
        for (const file of Object.values(parser.$refs.values())) {
            const schemas = Object.entries(file.components?.schemas || {}).concat(Object.entries(file));
            for (const [refName, schema] of schemas) {
                allRefs[refName] = schema as JSONSchema6;
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const writePath = join(writeBasePath, tocDirPath, params.item.include!.path);

        await mkdir(writePath, {recursive: true});
        await generateToc({data, writePath, leadingPage, filter, vars});
        await generateContent({data, writePath, leadingPage, filter, vars, allRefs, sandbox});
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

function assertLeadingPageMode(mode: string) {
    const options: string[] = [LeadingPageMode.Leaf, LeadingPageMode.Section];
    const isValid = options.includes(mode);

    assert(isValid, `invalid leading page mode ${mode}, available options: ${options.join(', ')}`);
}

export type generateTocParams = {
    data: any;
    vars: YfmPreset;
    writePath: string;
    leadingPage: OpenApiIncluderParams['leadingPage'];
    filter: OpenApiIncluderParams['filter'];
};

async function generateToc(params: generateTocParams): Promise<any> {
    const {data, writePath, leadingPage, filter, vars} = params;
    const leadingPageName = leadingPage?.name ?? 'Overview';
    const leadingPageMode = leadingPage?.mode ?? LeadingPageMode.Leaf;

    assertLeadingPageMode(leadingPageMode);

    const filterContent = filterUsefullContent(filter, vars);
    const {tags, endpoints} = filterContent(parsers.paths(data, parsers.tags(data)));

    const toc: YfmTocItem & { items: YfmTocItem[] } = {
        name,
        items: [],
    };

    tags.forEach((tag, id) => {
        // eslint-disable-next-line no-shadow
        const {name, endpoints} = tag;

        const section: YfmTocItem & { items: YfmTocItem[] } = {
            name,
            items: [],
        };

        section.items = endpoints.map((endpoint) => handleEndpointRender(endpoint, id));

        addLeadingPage(section, leadingPageMode, leadingPageName, join(id, 'index.md'));

        toc.items.push(section);
    });

    for (const endpoint of endpoints) {
        toc.items.push(handleEndpointRender(endpoint));
    }

    addLeadingPage(toc, leadingPageMode, leadingPageName, 'index.md');

    await mkdir(dirname(writePath), {recursive: true});
    await writeFile(join(writePath, 'toc.yaml'), dump(toc));
}

// eslint-disable-next-line no-shadow
function addLeadingPage(section: YfmTocItem, mode: LeadingPageMode, name: string, href: string) {
    if (mode === LeadingPageMode.Leaf) {
        (section.items as YfmTocItem[]).unshift({
            name: name,
            href: href,
        });
    } else {
        section.href = href;
    }
}

export type generateContentParams = {
    data: any;
    vars: YfmPreset;
    writePath: string;
    allRefs: Refs;
    leadingPage: OpenApiIncluderParams['leadingPage'];
    filter: OpenApiIncluderParams['filter'];
    sandbox?: OpenApiIncluderParams['sandbox'];
};

async function generateContent(params: generateContentParams): Promise<void> {
    const {data, writePath, allRefs, leadingPage, filter, vars, sandbox} = params;
    const filterContent = filterUsefullContent(filter, vars);

    const leadingPageSpecRenderMode = leadingPage?.spec?.renderMode ?? SPEC_RENDER_MODE_DEFAULT;
    assertSpecRenderMode(leadingPageSpecRenderMode);

    const results = [];

    const info: Info = parsers.info(data);
    const spec = filterContent(parsers.paths(data, parsers.tags(data)));

    const main: string = generators.main({data, info, spec, leadingPageSpecRenderMode});

    results.push({
        path: join(writePath, 'index.md'),
        content: main,
    });

    spec.tags.forEach((tag, id) => {
        const {endpoints} = tag;

        results.push({
            path: join(writePath, id, 'index.md'),
            content: generators.section(tag),
        });

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

function filterUsefullContent(filter: OpenApiIncluderParams['filter'], vars: YfmPreset) {
    const {endpoint: endpointExpr, tag: tagExpr} = filter || {};

    return (spec: Specification): Specification => {
        const filterTag = (tag: Tag) => (
            tagExpr
                ? evalExp(tagExpr, {...tag, vars})
                : true
        );
        const filterEndpoint = (endpoint: Endpoint) => (
            endpointExpr
                ? evalExp(endpointExpr, {...endpoint, vars})
                : true
        );
        const {tags, endpoints, ...rest} = spec;

        const newTags: Map<string, Tag> = new Map();
        const newEndpoints = endpoints.filter(filterEndpoint);

        tags.forEach((tag, id) => {
            if (!filterTag(tag)) {
                return;
            }

            // eslint-disable-next-line no-shadow
            const {endpoints, ...rest} = tag;
            // eslint-disable-next-line no-shadow
            const newEndpoints = endpoints.filter(filterEndpoint);

            if (newEndpoints.length) {
                newTags.set(id, {
                    ...rest,
                    endpoints: newEndpoints,
                });
            }
        });

        return {
            ...rest,
            tags: newTags,
            endpoints: newEndpoints,
        };
    };
}

export function sectionName(e: Endpoint): string {
    return e.summary ?? e.operationId ?? `${e.method} ${e.path}`;
}

export function mdPath(e: Endpoint): string {
    return `${e.id}.md`;
}

export {name, includerFunction};

export default {name, includerFunction};
