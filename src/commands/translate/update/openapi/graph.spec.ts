import {describe, expect, it} from 'vitest';
import {stringify} from 'yaml';

import {equality, pointer, pointerTokens, readContractGraph, valueAt} from './graph';

const path = 'api/spec.yaml';
const spec = (reference: string) =>
    stringify({openapi: '3.0.3', paths: {'/trackings': {$ref: reference}}});

describe('OpenAPI source graph', () => {
    it('resolves an escaped JSON pointer in a relative path and retains reference siblings', () => {
        const snapshot = new Map([
            [
                path,
                stringify({
                    openapi: '3.0.3',
                    paths: {
                        '/trackings': {
                            $ref: '../fragments/midnight%20scans.yaml#/camera~1longExposure~0',
                            description: 'Recorded through the west cupola.',
                        },
                    },
                }),
            ],
            [
                'fragments/midnight scans.yaml',
                stringify({
                    'camera/longExposure~': {get: {operationId: 'scanMeteorTrack'}},
                    allowBinning: false,
                }),
            ],
        ]);
        const parsed = readContractGraph(path, snapshot, new Map());
        expect(valueAt(parsed.api, ['paths', '/trackings'])).toEqual({
            description: 'Recorded through the west cupola.',
            get: {operationId: 'scanMeteorTrack'},
        });
        expect(parsed.definitions.has('allowBinning')).toBe(false);
        expect(pointerTokens(pointer(['camera/longExposure~', 1]))).toEqual([
            'camera/longExposure~',
            '1',
        ]);
        expect(valueAt({entries: [false]}, ['entries', 0])).toBe(false);
        expect(valueAt({entries: [false]}, ['entries', 0, 'missing'])).toBeUndefined();
        expect(valueAt({}, ['toString'])).toBeUndefined();
    });

    it.each([
        ['https://example.com/routes.yaml', /unsupported local reference/],
        ['/external.yaml', /unsupported local reference/],
        ['routes.yaml?draft=true', /unsupported local reference/],
        ['routes.yaml#/path#extra', /unsupported local reference/],
        ['routes.yaml#named-anchor', /invalid reference pointer/],
        ['routes.yaml#/invalid~2key', /invalid reference pointer/],
        ['routes.yaml#/missing', /unresolved reference/],
    ])('rejects %s before projecting the contract', (reference, message) => {
        const snapshot = new Map([[path, spec(reference)]]);
        expect(() => readContractGraph(path, snapshot, new Map())).toThrow(message);
    });

    it.each(['openapi: 3.1.0\npaths: {}', 'openapi: 3.0.3\npaths: []', '[]'])(
        'rejects an unsupported OpenAPI root (%s)',
        (content) => {
            expect(() => readContractGraph(path, new Map([[path, content]]), new Map())).toThrow(
                'invalid OpenAPI root',
            );
        },
    );

    it('rejects references whose targets form a cycle without an object definition', () => {
        const snapshot = new Map([
            [path, spec('routes.yaml#/first')],
            ['api/routes.yaml', stringify({first: {$ref: '#/second'}, second: {$ref: '#/first'}})],
        ]);
        expect(() => readContractGraph(path, snapshot, new Map())).toThrow(
            'recursive chain of reference objects',
        );
    });

    it('compares recursive definitions and notices changed fields outside their cycles', () => {
        const same = equality();
        const make = (type: string) => {
            const schema = {next: undefined as object | undefined, type};
            schema.next = schema;
            return schema;
        };
        const before = make('object');
        const identical = make('object');
        const changed = make('string');
        expect(same(before, identical)).toBe(true);
        expect(same(before, changed)).toBe(false);
        expect(same(before, changed)).toBe(false);
        expect(same({type: 'object'}, {kind: 'object'})).toBe(false);
        expect(same({0: 'string'}, ['string'])).toBe(false);
    });
});
