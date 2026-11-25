import type {PathItem} from './description';

import {isDeepStrictEqual} from 'node:util';
import {type YAMLMap, isMap, isScalar, isSeq, parseDocument, stringify} from 'yaml';

import {yfmInlineInventory, yfmProse} from '../text/yfm-units';

import {trimTrailingNewlines} from './literal';

type Value = string | number | boolean | null | Value[] | Mapping;
interface Mapping {
    [key: string]: Value;
}

type ReadDependency = (file: string) => {snapshot: string; current: string};
type RequestSchema = {
    method: string;
    id: string;
    key: string;
    requestRequired: unknown;
    schema: YAMLMap;
    properties: YAMLMap;
    root: YAMLMap;
};

const methods = new Set(['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace']);
const propertyFields = new Set([
    'description',
    'type',
    'nullable',
    'minItems',
    'maxItems',
    'uniqueItems',
    'items',
]);
const annotations = new Set(['description', 'deprecated']);
const localSchemaReference = /^#\/([A-Za-z]\w*)$/;
const externalItemReference = /^([\w./-]+\.(?:ya?ml|json))#\/([A-Za-z][\w.-]*)$/;
function conflict(reason: string): never {
    throw new Error(`Cannot project added OpenAPI request property: ${reason}`);
}

function plainMap(node: unknown): YAMLMap {
    if (!isMap(node) || node.anchor || node.tag) {
        conflict('expected an untagged YAML mapping');
    }
    return node;
}

function parseRoot(text: string): YAMLMap {
    const document = parseDocument(text);
    if (document.errors.length || document.warnings.length) {
        conflict('invalid YAML');
    }
    return plainMap(document.contents);
}

function fieldName(node: unknown): string {
    if (
        !isScalar(node) ||
        typeof node.value !== 'string' ||
        node.value === '<<' ||
        node.tag ||
        node.anchor
    ) {
        conflict('invalid mapping key');
    }
    return node.value;
}

function plainValue(node: unknown): Value {
    if (isMap(node)) {
        return Object.fromEntries(
            plainMap(node).items.map(({key, value}) => [fieldName(key), plainValue(value)]),
        );
    }
    if (isSeq(node) && !node.tag && !node.anchor) {
        return node.items.map(plainValue);
    }
    if (isScalar(node) && !node.tag && !node.anchor) {
        const value = node.value;
        if (
            value === null ||
            typeof value === 'string' ||
            typeof value === 'boolean' ||
            (typeof value === 'number' && Number.isFinite(value))
        ) {
            return value;
        }
    }
    return conflict('unsupported YAML value');
}

function mapping(node: unknown): Mapping {
    return plainValue(plainMap(node)) as Mapping;
}

function asMapping(value: Value): Mapping {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        conflict('expected a schema mapping');
    }
    return value;
}

function requiredFields(schema: Mapping): string[] {
    const required = schema.required ?? [];
    if (!Array.isArray(required) || required.some((name) => typeof name !== 'string')) {
        conflict('invalid required fields');
    }
    return required as string[];
}

function readRequest(text: string, fragment: PathItem): RequestSchema {
    const root = parseRoot(text);
    const pathItem = plainMap(fragment.address.length ? root.getIn(fragment.address, true) : root);
    const operations = pathItem.items.filter(({key}) => methods.has(fieldName(key)));
    if (operations.length !== 1) {
        conflict('expected one operation in the source fragment');
    }
    const [{key, value}] = operations;
    const operation = plainMap(value);
    const id = operation.get('operationId');
    const request = plainMap(operation.get('requestBody', true));
    const alias = mapping(request.getIn(['content', 'application/json', 'schema'], true));
    const pointer = typeof alias.$ref === 'string' && localSchemaReference.exec(alias.$ref);
    if (typeof id !== 'string' || !id || !pointer || Object.keys(alias).length !== 1) {
        conflict('expected one local requestBody schema reference');
    }
    const schema = plainMap(root.get(pointer[1], true));
    const properties = plainMap(schema.get('properties', true));
    if (schema.get('type') !== 'object') {
        conflict('expected an object request schema');
    }
    return {
        method: fieldName(key),
        id,
        key: pointer[1],
        requestRequired: request.get('required'),
        schema,
        properties,
        root,
    };
}

function sameRequestIdentity(left: RequestSchema, right: RequestSchema): boolean {
    return (
        left.method === right.method &&
        left.id === right.id &&
        left.key === right.key &&
        left.requestRequired === right.requestRequired
    );
}

/** Follow the local request's existing schema references using OpenAPI 3.0 reference semantics. */
function technicalSchema(schema: Mapping, root?: YAMLMap, seen = new Set<string>()): Mapping {
    if (Object.prototype.hasOwnProperty.call(schema, '$ref')) {
        const pointer = typeof schema.$ref === 'string' && localSchemaReference.exec(schema.$ref);
        if (
            !root ||
            !pointer ||
            seen.has(pointer[1]) ||
            Object.keys(schema).some((key) => key !== '$ref' && !annotations.has(key))
        ) {
            return conflict('unsupported reference in the existing request schema');
        }
        return technicalSchema(
            mapping(root.get(pointer[1], true)),
            root,
            new Set([...seen, pointer[1]]),
        );
    }
    return Object.fromEntries(
        Object.entries(schema).flatMap(([key, value]) => {
            if (key === 'description') {
                return [];
            }
            if (key === 'properties') {
                return [
                    [
                        key,
                        Object.fromEntries(
                            Object.entries(asMapping(value)).map(([name, property]) => [
                                name,
                                technicalSchema(asMapping(property), root, seen),
                            ]),
                        ),
                    ],
                ];
            }
            return [[key, key === 'items' ? technicalSchema(asMapping(value), root, seen) : value]];
        }),
    );
}

function targetItemReference(
    reference: Value,
    target: YAMLMap,
    readDependency: ReadDependency,
): string {
    const items = asMapping(reference);
    const match = typeof items.$ref === 'string' && externalItemReference.exec(items.$ref);
    if (!match || match[1].startsWith('/') || Object.keys(items).length !== 1) {
        conflict('expected one local array item reference');
    }
    const [, file, name] = match;
    const {snapshot, current} = readDependency(file);
    const source = mapping(parseRoot(snapshot).get(name, true));
    const latest = mapping(parseRoot(current).get(name, true));
    if (!isDeepStrictEqual(source, latest)) {
        conflict('referenced item schema changed in the current source');
    }
    const localized = mapping(target.getIn(['components', 'schemas', name], true));
    const technical = technicalSchema(source);
    if (
        source.type !== 'string' ||
        typeof source.description !== 'string' ||
        typeof localized.description !== 'string' ||
        !localized.description.trim() ||
        !isDeepStrictEqual(technical, technicalSchema(localized))
    ) {
        conflict('target component does not match the referenced item schema');
    }
    return `#/components/schemas/${name}`;
}

/** Preserve the paragraph layout of the target YAML literal, including indentation. */
function proseStructure(markdown: string) {
    return markdown.split(/\n[ \t]*\n/).map((paragraph) => {
        const {opaque, protectedText} = yfmInlineInventory(paragraph);
        if (opaque || !yfmProse(paragraph).trim()) {
            conflict('expected a translatable paragraph');
        }
        return {
            protectedText,
            indent: paragraph.split('\n').map((line) => /^[ \t]*/.exec(line)![0]),
        };
    });
}

function trimEol(markdown: string) {
    return trimTrailingNewlines(markdown.replace(/\r\n/g, '\n'));
}

function addedReferencedProperty(
    oldRequest: RequestSchema,
    newRequest: RequestSchema,
    before: string,
    after: string,
) {
    const own = newRequest.properties.items.filter(
        ({key}) => !oldRequest.properties.has(fieldName(key)),
    );
    if (own.length !== 1) {
        return undefined;
    }
    const [{key, value}] = own;
    const name = fieldName(key);
    if (
        !/^[A-Za-z]\w*$/.test(name) ||
        requiredFields(mapping(newRequest.schema)).includes(name) ||
        !isScalar(key) ||
        !key.range ||
        !isMap(value) ||
        !value.range
    ) {
        return undefined;
    }

    const sourceStart = after.lastIndexOf('\n', key.range[0] - 1) + 1;
    const sourceEnd = value.range[1];
    if (
        after[sourceEnd - 1] !== '\n' ||
        after.slice(0, sourceStart) + after.slice(sourceEnd) !== before
    ) {
        return undefined;
    }

    const property = mapping(value);
    const {description, type, nullable, minItems, maxItems, uniqueItems, items} = property;
    if (
        Object.keys(property).some((key) => !propertyFields.has(key)) ||
        typeof description !== 'string' ||
        type !== 'array' ||
        !items ||
        typeof items !== 'object' ||
        Array.isArray(items) ||
        typeof items.$ref !== 'string' ||
        !externalItemReference.test(items.$ref) ||
        (nullable !== undefined && typeof nullable !== 'boolean') ||
        (uniqueItems !== undefined && typeof uniqueItems !== 'boolean') ||
        (minItems !== undefined &&
            (typeof minItems !== 'number' || !Number.isInteger(minItems) || minItems < 0)) ||
        (maxItems !== undefined &&
            (typeof maxItems !== 'number' || !Number.isInteger(maxItems) || maxItems < 0)) ||
        (typeof minItems === 'number' && typeof maxItems === 'number' && minItems > maxItems)
    ) {
        return undefined;
    }
    return {name, property, description, items};
}

/** Detect an added array property in a request schema. */
export function hasAddedReferencedRequestProperty(
    before: string,
    after: string,
    fragment: PathItem,
): boolean {
    try {
        const oldRequest = readRequest(before, fragment);
        const newRequest = readRequest(after, fragment);
        return addedReferencedProperty(oldRequest, newRequest, before, after) !== undefined;
    } catch (error) {
        if (
            error instanceof Error &&
            error.message.startsWith('Cannot project added OpenAPI request property:')
        ) {
            return false;
        }
        throw error;
    }
}

export function planOpenApiProperty(
    before: string,
    after: string,
    target: string,
    currentSource: string,
    fragment: PathItem,
    readDependency: ReadDependency,
): {markdown: string; apply(translated: string): string} {
    const oldRequest = readRequest(before, fragment);
    const newRequest = readRequest(after, fragment);
    const currentRequest = readRequest(currentSource, fragment);
    const oldSchema = mapping(oldRequest.schema);
    const newSchema = mapping(newRequest.schema);
    const currentSchema = mapping(currentRequest.schema);
    if (
        !sameRequestIdentity(oldRequest, newRequest) ||
        !sameRequestIdentity(oldRequest, currentRequest) ||
        (!isDeepStrictEqual(oldSchema, currentSchema) &&
            !isDeepStrictEqual(newSchema, currentSchema))
    ) {
        conflict('source request schema or operation changed in the current source');
    }

    const added = addedReferencedProperty(oldRequest, newRequest, before, after);
    if (!added) {
        conflict('expected one added optional array property with a local item reference');
    }
    const {name, property, description, items} = added;
    const markdown = trimEol(description);
    const sourceProse = proseStructure(markdown);

    const targetRoot = parseRoot(target);
    const version = targetRoot.get('openapi');
    const targetOperation = plainMap(
        targetRoot.getIn(['paths', fragment.route, oldRequest.method], true),
    );
    const request = plainMap(targetOperation.get('requestBody', true));
    const targetSchema = plainMap(request.getIn(['content', 'application/json', 'schema'], true));
    const targetProperties = plainMap(targetSchema.get('properties', true));
    if (
        typeof version !== 'string' ||
        !version.startsWith('3.0.') ||
        targetOperation.get('operationId') !== oldRequest.id ||
        request.get('required') !== oldRequest.requestRequired ||
        targetProperties.has(name) ||
        !isDeepStrictEqual(
            technicalSchema(oldSchema, oldRequest.root),
            technicalSchema(mapping(targetSchema)),
        ) ||
        !isDeepStrictEqual(
            technicalSchema(oldSchema, oldRequest.root),
            technicalSchema(
                isDeepStrictEqual(currentSchema, newSchema)
                    ? {...currentSchema, properties: oldSchema.properties}
                    : currentSchema,
                currentRequest.root,
            ),
        )
    ) {
        conflict('target or current request schema differs from the source before the change');
    }
    const itemReference = targetItemReference(items, targetRoot, readDependency);

    const lastKey = targetProperties.items.at(-1)?.key;
    const insertAt = targetProperties.range?.[1];
    if (
        targetProperties.flow ||
        !isScalar(lastKey) ||
        !lastKey.range ||
        insertAt === undefined ||
        target[insertAt - 1] !== '\n'
    ) {
        conflict('target properties lack a block insertion boundary');
    }
    const keyStart = target.lastIndexOf('\n', lastKey.range[0] - 1) + 1;
    const indent = target.slice(keyStart, lastKey.range[0]);
    if (!/^ +$/.test(indent)) {
        conflict('unsupported indentation');
    }
    const eol = target[insertAt - 2] === '\r' ? '\r\n' : '\n';

    return {
        markdown,
        apply(translated: string) {
            const prose = trimEol(translated);
            if (!isDeepStrictEqual(sourceProse, proseStructure(prose))) {
                conflict('translation changes paragraph structure or protected inline code');
            }
            const addition = stringify(
                {
                    [name]: {
                        ...property,
                        description: prose + '\n',
                        items: {$ref: itemReference},
                    },
                },
                {lineWidth: 0},
            ).trimEnd();
            const localized = addition
                .split('\n')
                .map((line) => (line ? indent + line : ''))
                .join(eol);
            return target.slice(0, insertAt) + localized + eol + target.slice(insertAt);
        },
    };
}
