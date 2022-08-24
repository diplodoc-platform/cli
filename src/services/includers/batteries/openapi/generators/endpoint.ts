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
        responses(data.responses),
    ];

    return block(page);
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
    const parametersTable = params?.length && table([
        ['name', 'type', 'required', 'description'],
        ...params.map((parameter: Parameter) =>
            [parameter.name, parameter.in, parameter.required, (parameter.description ?? '')]),
    ]);

    return parameters?.length && block([
        title(3)(PARAMETERS_SECTION_NAME),
        parametersTable,
    ]);
}

function responses(responses?: Responses) {
    return responses?.length && block([
        title(2)(RESPONSES_SECTION_NAME),
        block(responses.map(response)),
    ]);
}

function response(response: Response) {
    return block([
        title(3)(response.code),
        title(4)(DESCRIPTION_SECTION_NAME),
        body(response.description),
        response.schemas?.length && block(response.schemas.map(schema)),
    ]);
}

function schema({type, schema}: Schema) {
    return cut(code(JSON.stringify(schema, null, 4)), type);
}

export {endpoint};

export default {endpoint};
