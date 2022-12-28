import merger from 'json-schema-merge-allof';
import {JSONSchema6} from 'json-schema';
import stringify from 'json-stringify-safe';

import {block, title, body, table, code, cut} from './common';
import {
    DESCRIPTION_SECTION_NAME,
    REQUEST_SECTION_NAME,
    PARAMETERS_SECTION_NAME,
    RESPONSES_SECTION_NAME,
} from '../constants';

import {Endpoint, Parameters, Parameter, Responses, Response, Schema, Method} from '../types';

function endpoint(data: Endpoint) {
    const page = [
        title(1)(data.summary ?? data.id),
        description(data.description),
        request(data.path, data.method, data.servers),
        parameters(data.parameters),
        sandbox({
            params: data.parameters,
            servers: data.servers,
            path: data.path,
        }),
        requestBody(data.requestBody?.[0]),
        responses(data.responses),
    ];

    return block(page);
}

function sandbox({
    params,
    servers,
    path,
}: {
    params?: Parameters;
    servers: string[];
    path: string;
}) {
    const pathParams = params?.filter((param: Parameter) => param.in === 'path');

    return `{% openapi sandbox %}${JSON.stringify({
        pathParams,
        path: servers[0] + '/' + path,
    })}{% end openapi sandbox %}`;
}

function description(text?: string) {
    return text?.length && block([
        title(2)(DESCRIPTION_SECTION_NAME),
        body(text),
    ]);
}

function request(path: string, method: Method, servers: string[]) {
    const requestsTable = table([
        ['method', 'url'],
        [method, block(servers.map((href) => code(href + '/' + path)))],
    ]);

    return block([title(2)(REQUEST_SECTION_NAME), requestsTable]);
}

function parameters(params?: Parameters) {
    const pathParams = params?.filter((param: Parameter) => param.in === 'path');
    const queryParams = params?.filter((param: Parameter) => param.in === 'query');
    const headers = params?.filter((param: Parameter) => param.in === 'header');
    const cookies = params?.filter((param: Parameter) => param.in === 'cookie');

    const pathParamsTable = pathParams?.length && table([
        ['Name', 'Type', 'Required', 'Description'],
        ...pathParams.map((parameter: Parameter) =>
            [parameter.name, parameter.schema.type, parameter.required ? 'Yes' : 'No', (parameter.description ?? '')]),
    ]);

    const headersTable = headers?.length && table([
        ['Name', 'Type', 'Required', 'Description'],
        ...headers.map((parameter: Parameter) =>
            [parameter.name, parameter.schema.type, parameter.required ? 'Yes' : 'No', (parameter.description ?? '')]),
    ]);

    const queryParamsTable = queryParams?.length && table([
        ['Name', 'Type', 'Required', 'Description'],
        ...queryParams.map((parameter: Parameter) =>
            [parameter.name, parameter.schema.type, parameter.required ? 'Yes' : 'No', (parameter.description ?? '')]),
    ]);

    const cookiesTable = cookies?.length && table([
        ['Name', 'Type', 'Required', 'Description'],
        ...cookies.map((parameter: Parameter) =>
            [parameter.name, parameter.schema.type, parameter.required ? 'Yes' : 'No', (parameter.description ?? '')]),
    ]);

    return parameters?.length && block([
        (
            Boolean(pathParamsTable) ||
            Boolean(headersTable) ||
            Boolean(queryParamsTable) ||
            Boolean(cookiesTable)
        ) && title(2)(PARAMETERS_SECTION_NAME),
        Boolean(pathParamsTable) && title(3)('Path params'),
        pathParamsTable,
        Boolean(headersTable) && title(3)('Headers'),
        headersTable,
        Boolean(queryParamsTable) && title(3)('Query params'),
        queryParamsTable,
        Boolean(cookiesTable) && title(3)('Cookies'),
        cookiesTable,
    ]);
}

type TableRow = [string, string, string, string];

type TableData = TableRow[];

function requestBody(obj?: Schema) {
    const requestBodyTable = tableFromSchema(obj);

    return requestBodyTable && block([
        title(2)('Body'),
        requestBodyTable,
        obj && schemaCut(obj),
    ]);
}

function tableFromSchema(obj?: Schema) {
    if (!obj?.schema?.schema) {
        return '';
    }
    const schema = merger(obj.schema.schema as JSONSchema6);
    return table([
        ['Name', 'Type', 'Required', 'Description'],
        ...prepareSchemaObject(schema),
    ]);
}

function spacePrefix(str: string, prefixSize: number) {
    return `<span style="white-space: pre;">${' '.repeat(prefixSize)}</span>${str}`;
}

function prepareSchemaPrimitive(
    schema: {
        name?: string;
        type?: JSONSchema6['type'];
        required: boolean;
        description?: string;
    },
    prefixSize = 0,
): TableRow {
    return [
        spacePrefix(schema.name ?? '', prefixSize),
        String(schema.type),
        schema.required ? 'Yes' : 'No',
        (schema.description ?? ''),
    ];
}


function prepareSchemaObject(schema: JSONSchema6, prefixSize = 0) {
    const buffer: TableData = [];
    Object.entries(schema.properties || {}).forEach(([key, value]) => {
        if (value === true || value === false) {
            return;
        }
        if (value.type === 'object') {
            buffer.push([
                spacePrefix(key, prefixSize),
                value.type,
                schema.required?.includes(key) ? 'Yes' : 'No',
                value.description ?? '',
            ]);
            buffer.push(...prepareSchemaObject(value, prefixSize + 4));
        } else if (value.type === 'array') {
            if (value.items && value.items !== true && !Array.isArray(value.items)) {
                if (value.items.type === 'object') {
                    buffer.push([
                        spacePrefix(key, prefixSize),
                        'object[]',
                        schema.required?.includes(key) ? 'Yes' : 'No',
                        value.description ?? '',
                    ]);
                    buffer.push(...prepareSchemaObject(value.items, prefixSize + 4));
                } else {
                    buffer.push([
                        spacePrefix(key, prefixSize),
                        String(value.items.type) + '[]',
                        schema.required?.includes(key) ? 'Yes' : 'No',
                        value.description ?? '',
                    ]);
                }
            }
        } else {
            buffer.push(prepareSchemaPrimitive({
                ...value,
                required: schema.required?.includes(key) ?? false,
                name: key,
            }, prefixSize));
        }
    });
    return buffer;
}

function responses(resps?: Responses) {
    return resps?.length && block([
        title(2)(RESPONSES_SECTION_NAME),
        block(resps.map(response)),
    ]);
}

function response(resp: Response) {
    return block([
        title(3)(resp.code),
        title(4)(DESCRIPTION_SECTION_NAME),
        body(resp.description),
        resp.schemas?.length && block(resp.schemas.map(schemaCut)),
    ]);
}

/* eslint-disable-next-line no-shadow */
function schemaCut({type, schema}: Schema) {
    return cut(code(stringify(schema, null, 4)), type);
}

export {endpoint};

export default {endpoint};
