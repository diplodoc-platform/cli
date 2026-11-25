// OpenAPI3.0 annotation locations, matching the CLI translation schema.
const TEXT_CHILDREN: Record<string, Record<string, string>> = {
    api: {
        info: 'info',
        servers: 'list:server',
        paths: 'map:path',
        components: 'components',
        tags: 'list:tag',
        externalDocs: 'external',
    },
    components: {
        schemas: 'map:schema',
        parameters: 'map:parameter',
        responses: 'map:response',
        examples: 'map:example',
        requestBodies: 'map:body',
        headers: 'map:parameter',
        securitySchemes: 'map:security',
        links: 'map:link',
        callbacks: 'map:callback',
    },
    server: {variables: 'map:variable'},
    security: {flows: 'map:flow'},
    flow: {scopes: 'scope_map'},
    schema: {
        properties: 'map:schema',
        items: 'schema',
        additionalProperties: 'schema',
        allOf: 'list:schema',
        anyOf: 'list:schema',
        oneOf: 'list:schema',
        not: 'schema',
        externalDocs: 'external',
    },
    path: {
        get: 'operation',
        put: 'operation',
        post: 'operation',
        delete: 'operation',
        options: 'operation',
        head: 'operation',
        patch: 'operation',
        trace: 'operation',
        parameters: 'list:parameter',
        servers: 'list:server',
    },
    operation: {
        parameters: 'list:parameter',
        requestBody: 'body',
        responses: 'map:response',
        callbacks: 'map:callback',
        externalDocs: 'external',
        servers: 'list:server',
    },
    parameter: {schema: 'schema', content: 'map:media', examples: 'map:example'},
    response: {headers: 'map:parameter', content: 'map:media', links: 'map:link'},
    media: {schema: 'schema', examples: 'map:example', encoding: 'map:encoding'},
    encoding: {headers: 'map:parameter'},
    body: {content: 'map:media'},
    tag: {externalDocs: 'external'},
    link: {server: 'server'},
};
function nextContext(context: string, key: string): string {
    if (context.startsWith('map:') || context.startsWith('list:')) {
        return context.slice(context.indexOf(':') + 1);
    }
    if (context === 'callback') {
        return 'path';
    }
    return TEXT_CHILDREN[context]?.[key] ?? (context === 'unknown' ? 'unknown' : 'technical');
}
function isTextKey(context: string, key: string): boolean {
    if (context === 'scope_map') {
        return true;
    }
    if (key === 'title') {
        return context === 'info' || context === 'schema';
    }
    if (key === 'summary') {
        return ['operation', 'path', 'example'].includes(context);
    }
    return (
        key === 'description' &&
        [
            'info',
            'server',
            'variable',
            'schema',
            'response',
            'example',
            'parameter',
            'path',
            'operation',
            'tag',
            'external',
            'body',
            'security',
            'link',
        ].includes(context)
    );
}
function pointerTokens(pointer: string): string[] {
    return pointer
        ? pointer
              .slice(1)
              .split('/')
              .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'))
        : [];
}
export function isTextPointer(pointer: string): boolean {
    const keys = pointerTokens(pointer);
    let context = 'api';
    for (const key of keys.slice(0, -1)) {
        context = nextContext(context, key);
    }
    // Scope values are translated only through supplemental description slots.
    return context !== 'scope_map' && isTextKey(context, keys.at(-1) ?? '');
}
