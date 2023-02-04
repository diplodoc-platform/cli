import {page, block, title, body, table, code, cut} from './common';
import {
    COOKIES_SECTION_NAME,
    HEADERS_SECTION_NAME,
    PATH_PARAMETERS_SECTION_NAME,
    QUERY_PARAMETERS_SECTION_NAME,
    REQUEST_SECTION_NAME,
    RESPONSES_SECTION_NAME,
} from '../constants';

import {
    Endpoint,
    Parameters,
    Parameter,
    Responses,
    Response,
    Schema,
    Method,
    Refs,
    Server,
    Servers,
} from '../types';
import stringify from 'json-stringify-safe';
import {prepareTableRowData, prepareSampleObject, tableFromSchema, tableParameterName} from './traverse';
import {concatNewLine} from '../../common';

function endpoint(allRefs: Refs, data: Endpoint) {
    // try to remember, which tables we are already printed on page
    const pagePrintedRefs = new Set<string>();
    const endpointPage = [
        title(1)(data.summary ?? data.id),
        data.description?.length && body(data.description),
        request(data.path, data.method, data.servers),
        parameters(data.parameters),
        openapiBody(allRefs, pagePrintedRefs, data.requestBody),
        responses(allRefs, pagePrintedRefs, data.responses),
    ];

    return page(block(endpointPage));
}

function request(path: string, method: Method, servers: Servers) {
    const requestTableCols = ['method', 'url'];

    const hrefs = block(servers.map(({url}) => code(url + '/' + path)));

    const requestTableRow = [code(method), hrefs];

    if (servers.every((server: Server) => server.description)) {
        requestTableCols.push('description');

        const descriptions = block(servers.map(({description}) => code(description as string)));

        requestTableRow.push(descriptions);
    }

    const requestTable = table([
        requestTableCols,
        requestTableRow,
    ]);

    return block([title(2)(REQUEST_SECTION_NAME), requestTable]);
}

function parameters(params?: Parameters) {
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
            tables.push(title(3)(heading));
            tables.push(table([
                ['Name', 'Type', 'Description'],
                ...inParams.map(parameterRow),
            ]));
        }
    }
    return block(tables);
}

function parameterRow(param: Parameter) {
    const row = prepareTableRowData({}, param.schema, param.name);
    let description = param.description ?? '';
    if (row.description.length) {
        description = concatNewLine(description, row.description);
    }
    if (param.example !== undefined) {
        description = concatNewLine(description, `Example: \`${param.example}\``);
    }
    if (param.default !== undefined) {
        description = concatNewLine(description, `Default: \`${param.default}\``);
    }
    return [tableParameterName(param.name, param.required), row.type, description];
}

function openapiBody(allRefs: Refs, pagePrintedRefs: Set<string>, obj?: Schema) {
    if (!obj) {
        return '';
    }

    const {type = 'schema', schema} = obj;
    const {content, tableRefs} = tableFromSchema(allRefs, schema);
    const parsedSchema = prepareSampleObject(schema);

    const result = [
        block([
            title(3)('Body'),
            cut(code(stringify(parsedSchema, null, 4)), type),
            content,
        ]),
    ];

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

    return block(result);
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
