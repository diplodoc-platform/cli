import {expect, test} from 'vitest';
import {parse} from 'yaml';

import {hasAddedReferencedRequestProperty, planOpenApiProperty} from './request-property';

const path = {route: '/search', address: ['search']};
const source = [
    'search:',
    '  post:',
    '    operationId: searchAssets',
    '    requestBody:',
    '      required: true',
    '      content:',
    '        application/json:',
    '          schema:',
    '            $ref: "#/Query"',
    'Query:',
    '  type: object',
    '  required: [prefix]',
    '  properties:',
    '    prefix:',
    '      $ref: "#/Prefix"',
    'Prefix:',
    '  type: string',
    '  description: Начало имени.',
    '',
].join('\n');
const addition = [
    '    assetIds:',
    '      description: |',
    '        Укажите идентификаторы `asset`.',
    '      type: array',
    '      nullable: true',
    '      minItems: 1',
    '      maxItems: 10',
    '      uniqueItems: false',
    '      items:',
    '        $ref: "models/ids.yml#/AssetId"',
    '',
].join('\n');
const after = source.replace('Prefix:\n', addition + 'Prefix:\n');
const target = [
    'openapi: 3.0.3',
    'paths:',
    '  /search:',
    '    post:',
    '      operationId: searchAssets',
    '      requestBody:',
    '        required: true',
    '        content:',
    '          application/json:',
    '            schema:',
    '              type: object',
    '              required: [prefix]',
    '              properties:',
    '                prefix:',
    '                  type: string',
    '                  description: Reviewed prefix.',
    'components:',
    '  schemas:',
    '    AssetId:',
    '      type: string',
    '      minLength: 1',
    '      description: Approved identifier.',
    '',
].join('\n');
const model = 'AssetId:\n  type: string\n  minLength: 1\n  description: Идентификатор.\n';
const unchanged = (file: string) => {
    expect(file).toBe('models/ids.yml');
    return {snapshot: model, current: model};
};

test.each([source, after])(
    'adds an optional property before or after the source merge',
    (current) => {
        expect(hasAddedReferencedRequestProperty(source, after, path)).toBe(true);
        const update = planOpenApiProperty(source, after, target, current, path, unchanged);
        expect(update.markdown).toBe('Укажите идентификаторы `asset`.');
        const output = update.apply('Enter the `asset` identifiers.');
        const parsed = parse(output);
        expect(
            parsed.paths['/search'].post.requestBody.content['application/json'].schema.properties,
        ).toEqual({
            prefix: {type: 'string', description: 'Reviewed prefix.'},
            assetIds: {
                type: 'array',
                nullable: true,
                minItems: 1,
                maxItems: 10,
                uniqueItems: false,
                description: 'Enter the `asset` identifiers.\n',
                items: {$ref: '#/components/schemas/AssetId'},
            },
        });
        expect(output.replace(/^ {16}assetIds:\n[\s\S]*?(?=^components:)/m, '')).toBe(target);
        expect(() => update.apply('Enter the `wrong` identifiers.')).toThrow(
            'protected inline code',
        );
        expect(() => update.apply('```text\nnot prose\n```')).toThrow('translatable paragraph');
    },
);

test('retains the CRLF and indentation of the target', () => {
    const crlf = target.replace(/\n/g, '\r\n');
    const result = planOpenApiProperty(source, after, crlf, source, path, unchanged).apply(
        'Enter the `asset` identifiers.\r\n',
    );
    expect(result).toContain('\r\n                assetIds:\r\n');
    expect(result.replace(/\r\n/g, '')).not.toContain('\n');
});

test.each([
    ['no addition', source],
    ['invalid YAML', '[---'],
    ['no single operation', after.replace('  post:', '  x-test:')],
    ['unsupported request reference', after.replace('#/Query', 'other.yaml#/Query')],
    ['a non-object request', after.replace('  type: object', '  type: array')],
    ['an invalid field key', after.replace('assetIds:', 'asset-ids:')],
    ['two added fields', after.replace('    assetIds:', '    other: true\n    assetIds:')],
    ['changed original text', after.replace('Начало имени.', 'Иное начало. ')],
    ['unsupported item type', after.replace('      type: array', '      type: string')],
    ['an inline item schema', after.replace('$ref: "models/ids.yml#/AssetId"', 'type: string')],
    [
        'missing item schema',
        after.replace('      items:\n        $ref: "models/ids.yml#/AssetId"\n', ''),
    ],
    [
        'unsupported added field constraint',
        after.replace('      nullable: true', '      descriptionFormat: html'),
    ],
    ['bad nullable', after.replace('nullable: true', 'nullable: string')],
    ['bad uniqueItems', after.replace('uniqueItems: false', 'uniqueItems: 3')],
    ['bad minimum', after.replace('minItems: 1', 'minItems: -1')],
    ['bad maximum', after.replace('maxItems: 10', 'maxItems: 3.5')],
    ['minimum exceeds maximum', after.replace('minItems: 1', 'minItems: 11')],
    ['anchored field', after.replace('assetIds:', 'assetIds: &items')],
])('does not pick the specific referenced-array path for %s', (_kind, changed) => {
    expect(hasAddedReferencedRequestProperty(source, changed, path)).toBe(false);
});

test('rejects a source operation or existing request schema change', () => {
    expect(() =>
        planOpenApiProperty(
            source,
            after,
            target,
            source.replace('searchAssets', 'otherOperation'),
            path,
            unchanged,
        ),
    ).toThrow('source request schema or operation changed');
    expect(() =>
        planOpenApiProperty(
            source,
            after,
            target,
            source.replace('required: [prefix]', 'required: []'),
            path,
            unchanged,
        ),
    ).toThrow('source request schema or operation changed');
    expect(() => planOpenApiProperty(source, source, target, source, path, unchanged)).toThrow(
        'expected one added optional array property',
    );
    const changedDependency = source.replace('  type: string', '  type: number');
    expect(() =>
        planOpenApiProperty(source, after, target, changedDependency, path, unchanged),
    ).toThrow('target or current request schema differs');
});

test.each([
    ['an OpenAPI 3.1 target', target.replace('3.0.3', '3.1.0')],
    ['different operation', target.replace('searchAssets', 'wrong')],
    ['different required flag', target.replace('required: true', 'required: false')],
    [
        'already localized property',
        target.replace(
            '                prefix:',
            '                assetIds: {}\n                prefix:',
        ),
    ],
    ['existing request schema change', target.replace('required: [prefix]', 'required: []')],
])('rejects target drift: %s', (_kind, changed) => {
    expect(() => planOpenApiProperty(source, after, changed, source, path, unchanged)).toThrow(
        'target or current request schema differs',
    );
});

test('checks dependency stability and exact type compatibility', () => {
    expect(() =>
        planOpenApiProperty(source, after, target, source, path, () => ({
            snapshot: model,
            current: model.replace('minLength: 1', 'minLength: 2'),
        })),
    ).toThrow('referenced item schema changed');
    expect(() =>
        planOpenApiProperty(
            source,
            after,
            target.replace('minLength: 1', 'minLength: 2'),
            source,
            path,
            unchanged,
        ),
    ).toThrow('target component does not match');
    expect(() =>
        planOpenApiProperty(
            source,
            after.replace('models/ids.yml', '/models/ids.yml'),
            target,
            source,
            path,
            unchanged,
        ),
    ).toThrow('expected one local array item reference');
    expect(() =>
        planOpenApiProperty(
            source,
            after.replace(
                '        $ref: "models/ids.yml#/AssetId"',
                '        $ref: "models/ids.yml#/AssetId"\n        title: Redundant',
            ),
            target,
            source,
            path,
            unchanged,
        ),
    ).toThrow('expected one local array item reference');
});

test('rejects flow-style localized properties without a byte-local insertion point', () => {
    const flow = target.replace(
        'properties:\n                prefix:\n                  type: string\n                  description: Reviewed prefix.',
        'properties: {prefix: {type: string, description: Reviewed prefix.}}',
    );
    expect(() => planOpenApiProperty(source, after, flow, source, path, unchanged)).toThrow(
        'block insertion boundary',
    );
});

test('does not follow a recursive request schema reference', () => {
    const recursive = source.replace(
        '  type: string\n  description: Начало имени.',
        '  $ref: "#/Prefix"',
    );
    const updated = recursive.replace('Prefix:\n', addition + 'Prefix:\n');
    expect(() =>
        planOpenApiProperty(recursive, updated, target, recursive, path, unchanged),
    ).toThrow('unsupported reference in the existing request schema');
});
