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
    method: Method;
    path: string;
    tags: string[];
    summary?: string;
    description?: string;
    servers: string[];
    parameters?: Parameters;
    responses?: Responses;
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
};

export type Parameters = Parameter[];

export type Parameter = {
    name: string;
    in: string;
    required: string;
    description: string;
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
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    schema: {[key: string]: any};
};
