import {JSONSchema6} from 'json-schema';
import {table} from './common';
import slugify from 'slugify';
import stringify from 'json-stringify-safe';

import {concatNewLine} from '../../common';
import {openapiBlock} from './constants';
import {SUPPORTED_ENUM_TYPES} from '../constants';

import {JsType, Refs, SupportedEnumType} from '../types';

type TableRow = [string, string, string];

function anchor(ref: string) {
    return `<a href='#${slugify(ref).toLowerCase()}'>${ref}</a>`;
}

export function tableParameterName(key: string, required?: boolean) {
    return required ? `${key}<span class="${openapiBlock('required')}">*</span>` : key;
}

export function tableFromSchema(allRefs: Refs, schema: JSONSchema6): {content: string; tableRefs: string[]} {
    if (schema.enum) {
        // enum description will be in table description
        const description = prepareComplexDescription('', schema);
        const content = table([
            ['Type', 'Description'],
            [inferType(schema), description],
        ]);
        return {content, tableRefs: []};
    }
    const {rows, refs} = prepareObjectSchemaTable(allRefs, schema);
    const content = table([
        ['Name', 'Type', 'Description'],
        ...rows,
    ]);
    return {content, tableRefs: refs};
}

type PrepareObjectSchemaTableResult = {
    rows: TableRow[];
    refs: string[];
};

function prepareObjectSchemaTable(refs: Refs, schema: JSONSchema6): PrepareObjectSchemaTableResult {
    const result: PrepareObjectSchemaTableResult = {rows: [], refs: []};
    const merged = merge(schema);
    Object.entries(merged.properties || {}).forEach(([key, v]) => {
        const value = merge(v);
        const name = tableParameterName(key, isRequired(key, schema));
        const {type, description, ref} = prepareTableRowData(refs, value, key);
        result.rows.push([name, type, description]);
        if (ref) {
            result.refs.push(ref);
        }
    });
    return result;
}

type PrepareRowResult = {
  type: string;
  description: string;
  ref?: string;
};

export function prepareTableRowData(allRefs: Refs, value: JSONSchema6, key?: string): PrepareRowResult {
    const description = value.description || '';
    const ref = findRef(allRefs, value);
    if (ref) {
        return {type: anchor(ref), description, ref};
    }
    if (inferType(value) === 'array') {
        if (!value.items || value.items === true || Array.isArray(value.items)) {
            throw Error(`unsupported array items for ${key}`);
        }
        const inner = prepareTableRowData(allRefs, value.items, key);
        return {
            type: `${inner.type}[]`,
            // if inner.ref present, inner description will be in separate table
            description: inner.ref ? description : concatNewLine(description, inner.description),
            ref: inner.ref,
        };
    }
    return {type: `${inferType(value)}`, description: prepareComplexDescription(description, value)};
}

function prepareComplexDescription(baseDescription: string, value: JSONSchema6): string {
    let description = baseDescription;
    const enumValues = value.enum?.map((s) => `\`${s}\``).join(', ');
    if (enumValues) {
        description = concatNewLine(description, `Enum: ${enumValues}`);
    }
    if (value.default) {
        description = concatNewLine(description, `Default: \`${value.default}\``);
    }
    return description;
}

// find dereferenced object from schema in all components/schemas
function findRef(allRefs: Refs, value: JSONSchema6): string | undefined {
    for (const [k, v] of Object.entries(allRefs)) {
        // @apidevtools/swagger-parser guaranties, that in refs list there will be the same objects
        // but same objects can have different descriptions
        if (v.properties && v.properties === value.properties) {
            return k;
        }
        if (v.allOf && v.allOf === value.allOf) {
            return k;
        }
        if (v.enum && v.enum === value.enum) {
            return k;
        }
    }
    return undefined;
}
type OpenJSONSchema = JSONSchema6 & {example?: any};
type OpenJSONSchemaDefinition = OpenJSONSchema | boolean;

// sample key-value JSON body
export function prepareSampleObject(schema: OpenJSONSchema, callstack: JSONSchema6[] = []) {
    const result: { [key: string]: any } = {};
    if (schema.example) {
        return schema.example;
    }
    const merged = merge(schema);
    Object.entries(merged.properties || {}).forEach(([key, value]) => {
        const required = isRequired(key, merged);
        const possibleValue = prepareSampleElement(key, value, required, callstack);
        if (possibleValue !== undefined) {
            result[key] = possibleValue;
        }
    });
    return result;
}

function prepareSampleElement(key: string, v: OpenJSONSchemaDefinition, required: boolean, callstack: JSONSchema6[]): any {
    const value = merge(v);
    if (value.example) {
        return value.example;
    }
    if (value.enum?.length) {
        return value.enum[0];
    }
    if (value.default !== undefined) {
        return value.default;
    }
    if (!required && callstack.includes(value)) {
        // stop recursive cyclic links
        return undefined;
    }
    const downCallstack = callstack.concat(value);
    switch (inferType(value)) {
        case 'object':
            return prepareSampleObject(value, downCallstack);
        case 'array':
            if (!value.items || value.items === true || Array.isArray(value.items)) {
                throw Error(`unsupported array items for ${key}`);
            }
            return [prepareSampleElement(key, value.items, isRequired(key, value), downCallstack)];
        case 'string':
            switch (value.format) {
                case 'uuid':
                    return 'c3073b9d-edd0-49f2-a28d-b7ded8ff9a8b';
                case 'date-time':
                    return '2022-12-29T18:02:01Z';
                default:
                    return 'string';
            }
        case 'number':
        case 'integer':
            return 0;
        case 'boolean':
            return false;
    }
    if (value.properties) {
        // if no "type" specified
        return prepareSampleObject(value, downCallstack);
    }
    return undefined;
}

// unwrapping such samples
// custom:
//   additionalProperties:
//     allOf:
//     - $ref: '#/components/schemas/TimeInterval1'
//   description: asfsdfsdf
//   type: object
// OR
// custom:
//   items:
//     allOf:
//       - $ref: '#/components/schemas/TimeInterval1'
//   description: asfsdfsdf
//   type: object
function merge(value: OpenJSONSchemaDefinition): OpenJSONSchema {
    if (typeof value === 'boolean') {
        throw Error('Boolean value isn\'t supported');
    }
    if (value.additionalProperties) {
        const result = value.additionalProperties;
        if (typeof result === 'boolean') {
            throw Error('Boolean in additionalProperties isn\'t supported');
        }
        result.description = value.description;
        return merge(result);
    }
    if (value.items) {
        const result = value.items;
        if (Array.isArray(result)) {
            throw Error('Array in items isn\'t supported');
        }
        return {...value, items: merge(result)};
    }
    if (!value.allOf || value.allOf.length === 0) {
        return value;
    }
    if (value.allOf.length === 1) {
        // save original object to search it in Refs by ===
        return merge(value.allOf[0]);
    }
    let description = '';
    const properties: { [key: string]: any } = {};
    for (const element of value.allOf) {
        if (typeof element === 'boolean') {
            throw Error('Boolean in allOf isn\'t supported');
        }
        if (element.description) {
            description = concatNewLine(description, element.description);
        }
        const mergedElement = merge(element);
        for (const [k, v] of Object.entries(mergedElement?.properties ?? {})) {
            properties[k] = v;
        }
    }
    return {type: 'object', description, properties, allOf: value.allOf};
}

function isRequired(key: string, value: JSONSchema6): boolean {
    return value.required?.includes(key) ?? false;
}

function inferType(value: OpenJSONSchema): Exclude<JSONSchema6['type'], undefined> {
    if (value.type) {
        return value.type;
    }

    if (value.enum) {
        const enumType = typeof value.enum[0];
        if (isSupportedEnumType(enumType)) {
            return enumType;
        }

        throw new Error(`Unsupported enum type in value: ${stringify(value)}`);
    }
    
    throw new Error(`Unsupported value: ${stringify(value)}`);
}

function isSupportedEnumType(enumType: JsType): enumType is SupportedEnumType {
    return SUPPORTED_ENUM_TYPES.some((type) => enumType === type);
}
