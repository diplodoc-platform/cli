import {JSONSchema6} from 'json-schema';
import stringify from 'json-stringify-safe';

import {meta, page, block, title, body, table, code, cut, tabs, bold} from './common';
import {
    INFO_TAB_NAME,
    SANDBOX_TAB_NAME,
    COOKIES_SECTION_NAME,
    HEADERS_SECTION_NAME,
    PATH_PARAMETERS_SECTION_NAME,
    QUERY_PARAMETERS_SECTION_NAME,
    REQUEST_SECTION_NAME,
    RESPONSES_SECTION_NAME,
    PRIMITIVE_JSON6_SCHEMA_TYPES,
} from '../constants';

import {
    Endpoint,
    Parameters,
    Parameter,
    Responses,
    Response,
    Schema,
    Refs,
    Server,
    Security,
} from '../types';
import {prepareTableRowData, prepareSampleObject, tableFromSchema, tableParameterName} from './traverse';
import {concatNewLine} from '../../common';
import {openapiBlock} from './constants';

function endpoint(allRefs: Refs, data: Endpoint, sandboxPlugin: {host?: string; tabName?: string} | undefined) {
    // try to remember, which tables we are already printed on page
    const pagePrintedRefs = new Set<string>();

    const contentWrapper = (content: string) => {
        return sandboxPlugin ? tabs({
            [INFO_TAB_NAME]: content,
            [(sandboxPlugin?.tabName ?? SANDBOX_TAB_NAME)]: sandbox({
                params: data.parameters,
                host: sandboxPlugin?.host,
                path: data.path,
                security: data.security,
                requestBody: data.requestBody,
                method: data.method,
            }),
        }) : content;
    };

    const endpointPage = block([
        title(1)(data.summary ?? data.id),
        contentWrapper(block([
            data.description?.length && body(data.description),
            request(data),
            parameters(allRefs, pagePrintedRefs, data.parameters),
            openapiBody(allRefs, pagePrintedRefs, data.requestBody),
            responses(allRefs, pagePrintedRefs, data.responses),
        ])),
    ]);

    return block([
        meta([
            data.noindex && 'noIndex: true',
        ]),
        `<div class="${openapiBlock()}">`,
        page(endpointPage),
        '</div>',
    ]).trim();
}

function sandbox({
    params,
    host,
    path,
    security,
    requestBody,
    method,
}: {
    params?: Parameters;
    host?: string;
    path: string;
    security: Security[];
    requestBody?: any;
    method: string;
}) {
    const pathParams = params?.filter((param: Parameter) => param.in === 'path');
    const searchParams = params?.filter((param: Parameter) => param.in === 'query');
    const headers = params?.filter((param: Parameter) => param.in === 'header');
    let bodyStr: null | string = null;
    if (requestBody?.type === 'application/json') {
        bodyStr = JSON.stringify(prepareSampleObject(requestBody?.schema ?? {}), null, 2);
    }

    const props = JSON.stringify({
        pathParams,
        searchParams,
        headers,
        body: bodyStr,
        method,
        security,
        path: path,
        host: host ?? '',
    });

    return block([
        '{% openapi sandbox %}',
        props,
        '{% end openapi sandbox %}',
    ]);
}

function request(data: Endpoint) {
    const {path, method, servers} = data;
    const requestTableCols = ['method', 'url'];

    const hrefs = block(servers.map(({url}) => code(url + '/' + path)));

    const requestTableRow = [code(method.toUpperCase()), hrefs];

    if (servers.every((server: Server) => server.description)) {
        requestTableCols.push('description');

        const descriptions = block(servers.map(({description}) => code(description as string)));

        requestTableRow.push(descriptions);
    }

    const requestTable = table([
        requestTableCols,
        requestTableRow,
    ]);

    return block([
        title(2)(REQUEST_SECTION_NAME),
        requestTable,
    ]);
}

function parameters(allRefs: Refs, pagePrintedRefs: Set<string>, params?: Parameters) {
    const sections = {
        'path': PATH_PARAMETERS_SECTION_NAME,
        'query': QUERY_PARAMETERS_SECTION_NAME,
        'header': HEADERS_SECTION_NAME,
        'cookie': COOKIES_SECTION_NAME,
    };
    const tables = [];
    for (const [inValue, heading] of Object.entries(sections)) {
        const inParams = params?.filter((param: Parameter) => param.in === inValue);
        if (inParams?.length) {
            const rows: string[][] = [];
            const tableRefs: string[] = [];
            for (const param of inParams) {
                const {cells, ref} = parameterRow(allRefs, param);
                rows.push(cells);
                if (ref) {
                    // there may be enums, which should be printed in separate tables
                    tableRefs.push(ref);
                }
            }
            tables.push(title(3)(heading));
            tables.push(table([
                ['Name', 'Type', 'Description'],
                ...rows,
            ]));
            tables.push(...printAllTables(allRefs, pagePrintedRefs, tableRefs));
        }
    }
    return block(tables);
}

function parameterRow(allRefs: Refs, param: Parameter): {cells: string[]; ref?: string} {
    const row = prepareTableRowData(allRefs, param.schema, param.name);
    let description = param.description ?? '';
    if (!row.ref && row.description.length) {
        // if row.ref present, row.description will be printed in separate table
        description = concatNewLine(description, row.description);
    }
    if (param.example !== undefined) {
        description = concatNewLine(description, `Example: \`${param.example}\``);
    }
    if (param.default !== undefined) {
        description = concatNewLine(description, `Default: \`${param.default}\``);
    }
    return {
        cells: [tableParameterName(param.name, param.required), row.type, description],
        ref: row.ref,
    };
}

function openapiBody(allRefs: Refs, pagePrintedRefs: Set<string>, obj?: Schema) {
    if (!obj) {
        return '';
    }

    const {type = 'schema', schema} = obj;
    const sectionTitle = title(4)('Body');

    let result = [
        sectionTitle,
    ];

    if (isPrimitive(schema.type)) {
        result = [
            ...result,
            type,
            `${bold('Type:')} ${schema.type}`,
            schema.format && `${bold('Format:')} ${schema.format}`,
            schema.description && `${bold('Description:')} ${schema.description}`,
        ];


        return block(result);
    }

    const {content, tableRefs} = tableFromSchema(allRefs, schema);
    const parsedSchema = prepareSampleObject(schema);

    result = [
        ...result,
        cut(code(stringify(parsedSchema, null, 4)), type),
        content,
    ];

    result.push(...printAllTables(allRefs, pagePrintedRefs, tableRefs));

    return block(result);
}

function isPrimitive(type: JSONSchema6['type']) {
    return PRIMITIVE_JSON6_SCHEMA_TYPES.has(type);
}

function printAllTables(allRefs: Refs, pagePrintedRefs: Set<string>, tableRefs: string[]): string[] {
    const result = [];
    while (tableRefs.length > 0) {
        const tableRef = tableRefs.shift();
        if (tableRef && !pagePrintedRefs.has(tableRef)) {
            const ref = allRefs[tableRef];
            const schemaTable = tableFromSchema(allRefs, ref);
            result.push(block([
                title(3)(tableRef),
                ref.description,
                schemaTable.content,
            ]));
            tableRefs.push(...schemaTable.tableRefs);
            pagePrintedRefs.add(tableRef);
        }
    }
    return result;
}

function responses(refs: Refs, visited: Set<string>, resps?: Responses) {
    return resps?.length && block([
        title(2)(RESPONSES_SECTION_NAME),
        block(resps.map((resp) => response(refs, visited, resp))),
    ]);
}

function response(allRefs: Refs, visited: Set<string>, resp: Response) {
    let header = resp.code;

    if (resp.statusText.length) {
        header += ` ${resp.statusText}`;
    }

    return block([
        title(2)(header),
        body(resp.description),
        resp.schemas?.length && block(resp.schemas.map((s) => openapiBody(allRefs, visited, s))),
    ]);
}

export {endpoint};

export default {endpoint};
