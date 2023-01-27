import {Refs} from '../types';
import {JSONSchema6} from 'json-schema';
import {table} from './common';
import slugify from 'slugify';

type TableRow = [string, string, string];

function anchor(ref: string) {
    return `<a href='#${slugify(ref).toLowerCase()}'>${ref}</a>`;
}

export function tableParameterName(key: string, required?: boolean) {
    return required ? `<strong>${key}*</strong>` : key;
}

export function tableFromSchema(allRefs: Refs, schema: JSONSchema6): {content: string; tableRefs: string[]} {
    if (schema.enum) {
        const {type, description} = prepareTableRowData(allRefs, schema);
        const content = table([
            ['Type', 'Description'],
            [type, description],
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
    if (!merged) {
        return result;
    }
    Object.entries(merged.properties || {}).forEach(([key, v]) => {
        const value = merge(v);
        if (!value) {
            return;
        }
        const name = tableParameterName(key, schema.required?.includes(key) ?? false);
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
    let description = value.description || '';
    if (value.type === 'object') {
        const ref = findRef(allRefs, value);
        if (ref) {
            return {type: anchor(ref), description, ref};
        }
        return {type: 'object', description};
    }
    if (value.type === 'array') {
        if (value.items && value.items !== true && !Array.isArray(value.items)) {
            const ref = findRef(allRefs, value.items);
            if (ref) {
                return {type: `${anchor(ref)}[]`, description, ref};
            }
            return {type: `${value.items.type}[]`, description};
        }
        throw Error(`unsupported array items for ${key}`);
    }
    const enumValues = value.enum?.map((s) => `\`${s}\``).join(', ');
    if (enumValues) {
        description = concatNewLine(description, `Enum: ${enumValues}`);
    }
    if (value.default) {
        description = concatNewLine(description, `Default: \`${value.default}\``);
    }
    return {type: `${value.type}`, description};
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

// объект-пример JSON-а тела запроса или ответа
export function prepareSampleObject(schema: JSONSchema6, callstack: any[] = []) {
    const result: { [key: string]: any } = {};
    const merged = merge(schema);
    if (!merged) {
        return result;
    }
    Object.entries(merged.properties || {}).forEach(([key, v]) => {
        const value = merge(v);
        if (!value) {
            return;
        }
        const required = merged.required?.includes(key) ?? false;
        const possibleValue = prepareSampleElement(key, value, required, callstack);
        if (possibleValue !== undefined) {
            result[key] = possibleValue;
        }
    });
    return result;
}

function prepareSampleElement(key: string, value: JSONSchema6, required: boolean, callstack: any[]): any {
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
    switch (value.type) {
        case 'object':
            return prepareSampleObject(value, downCallstack);
        case 'array':
            if (!value.items || value.items === true || Array.isArray(value.items)) {
                throw Error(`unsupported array items for ${key}`);
            }
            if (value.items.type === 'object') {
                return [prepareSampleObject(value.items, downCallstack)];
            }
            return [value.items.type];
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
    throw Error(`unsupported type ${value.type} for ${key}`);
}

// unwrapping such samples
// custom:
//   additionalProperties:
//     allOf:
//     - $ref: '#/components/schemas/TimeInterval1'
//   description: asfsdfsdf
//   type: object
function merge(value: JSONSchema6 | boolean): JSONSchema6 | undefined {
    if (typeof value === 'boolean') {
        return undefined;
    }
    if (value.additionalProperties) {
        const result = value.additionalProperties;
        if (typeof result === 'boolean') {
            return undefined;
        }
        result.description = value.description;
        return merge(result);
    }
    if (value.allOf && value.allOf.length >= 1) {
        // save original object to search it in Refs by ===
        const original = value.allOf[0] as JSONSchema6;
        const properties: { [key: string]: any } = {};
        for (const element of value.allOf) {
            if (typeof element === 'boolean') {
                throw Error('Boolean in allOf isn\'t supported');
            }
            if (element.description) {
                original.description = element.description;
            }
            const mergedElement = merge(element);
            for (const [k, v] of Object.entries(mergedElement?.properties ?? {})) {
                properties[k] = v;
            }
        }
        original.properties = properties;
        return original;
    }
    return value;
}

function concatNewLine(prefix: string, suffix: string) {
    return prefix.trim().length ? `${prefix}<br>${suffix}` : suffix;
}
