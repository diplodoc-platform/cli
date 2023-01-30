import {JSONSchema6} from 'json-schema';

import {SPEC_RENDER_MODE_DEFAULT, SPEC_RENDER_MODE_HIDDEN} from './constants';

export const titleDepths = [1, 2, 3, 4, 5, 6] as const;

export type TitleDepth = typeof titleDepths[number];

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type OpenapiSpec = {[key: string]: any};

export type OpenapiOperation = {
    summary?: string;
    description?: string;
    operationId?: string;
    tags?: string[];
    servers?: Servers;
    parameters?: Parameters;
    responses?: {};
    requestBody?: any;
    'x-navtitle': string[];
};

export type Info = {
    name: string;
    version: string;
    description?: string;
    terms?: string;
    license?: License;
    contact?: Contact;
};

export type License = {
    name: string;
    url?: string;
};

export type Contact = {
    name: string;
    sources: ContactSource[];
};

export type ContactSource = {type: ContactSourceType; url: string};

export type ContactSourceType = 'web' | 'email';

export type Tag = {
    id: string;
    name: string;
    description?: string;
    endpoints: Endpoints;
};

export type Endpoints = Endpoint[];

export type Endpoint = {
    id: string;
    operationId?: string;
    method: Method;
    path: string;
    tags: string[];
    summary?: string;
    description?: string;
    servers: Servers;
    parameters?: Parameters;
    responses?: Responses;
    requestBody?: Schema;
};

export type Specification = {
    tags: Map<string, Tag>;
    endpoints: Endpoints;
};

export const methods = [
    'get',
    'put',
    'post',
    'delete',
    'options',
    'head',
    'patch',
    'trace',
] as const;

export type Method = typeof methods[number];

export type Servers = Server[];

export type Server = {
    url: string;
    description?: string;
};

export type Parameters = Parameter[];

export type In = 'path' | 'query' | 'header' | 'cookie';

export type Primitive = string | number | boolean;

export type Parameter = {
    name: string;
    in: In;
    required: boolean;
    description?: string;
    example?: Primitive;
    default?: Primitive;
    schema: JSONSchema6;
};

export type Responses = Response[];

export type Response = {
    // response code validation omitted
    code: string;
    description: string;
    schemas?: Schemas;
};

export type Schemas = Schema[];

export type Schema = {
    type: string;
    schema: JSONSchema6;
};

export type Refs = { [typeName: string]: JSONSchema6 };

export type LeadingPageSpecRenderMode = typeof SPEC_RENDER_MODE_DEFAULT | typeof SPEC_RENDER_MODE_HIDDEN;
