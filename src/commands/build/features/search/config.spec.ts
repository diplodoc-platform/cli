import type {SearchRawConfig} from './index';

import {describe, expect, it} from 'vitest';

import {normalizeSearch} from './config';

describe('search configuration', () => {
    it('keeps search disabled by default and supports legacy booleans', () => {
        expect(normalizeSearch(undefined, {}).enabled).toBe(false);
        expect(normalizeSearch(true, {})).toMatchObject({enabled: true, provider: 'local'});
        expect(normalizeSearch(false, {})).toMatchObject({enabled: false, provider: 'local'});
    });
    it('enables external search from flags and overrides config values', () => {
        expect(
            normalizeSearch(
                {provider: 'external', endpoint: '/old', options: {version: 'old'}},
                {
                    searchProvider: 'external',
                    searchEndpoint: '/new',
                    searchOptions: {version: 'new'},
                },
            ),
        ).toMatchObject({
            enabled: true,
            provider: 'external',
            endpoint: '/new',
            options: {version: 'new'},
        });
    });
    it('preserves --no-search with external configuration', () => {
        expect(
            normalizeSearch({provider: 'external', endpoint: '/query'}, {search: false}).enabled,
        ).toBe(false);
    });
    it('enables a selected provider while preserving explicit disablement', () => {
        expect(
            normalizeSearch(undefined, {searchProvider: 'external', searchEndpoint: '/query'})
                .enabled,
        ).toBe(true);
        expect(
            normalizeSearch(false, {searchProvider: 'external', searchEndpoint: '/query'}).enabled,
        ).toBe(false);
        expect(normalizeSearch({provider: 'algolia', appId: 'app'}, {})).toMatchObject({
            enabled: true,
            provider: 'algolia',
            appId: 'app',
        });
    });
    it.each([
        '',
        // eslint-disable-next-line no-script-url
        'javascript:alert(1)',
        'ftp://search.example.test',
        '//search.example.test',
        'https://user:password@search.example.test/query',
        '/query#fragment',
        'http://[',
        '/query with spaces',
        '/query\\path',
    ])('rejects unsupported external endpoint %s', (endpoint) => {
        expect(() => normalizeSearch({provider: 'external', endpoint}, {})).toThrow(
            'search.endpoint',
        );
    });
    it('requires an endpoint for enabled external search', () => {
        expect(() => normalizeSearch({provider: 'external'}, {})).toThrow('search.endpoint');
        expect(() => normalizeSearch({provider: 'external', enabled: false}, {})).not.toThrow();
    });
    it.each([[], 'text', null, {nested: {}}, {list: ['v1']}])(
        'rejects invalid public options %j',
        (options) => {
            expect(() =>
                normalizeSearch(
                    {
                        provider: 'external',
                        endpoint: '/query',
                        options,
                    } as unknown as SearchRawConfig['search'],
                    {},
                ),
            ).toThrow('search.options');
        },
    );
});

it('rejects a JSON null options flag instead of silently ignoring it', () => {
    expect(() =>
        normalizeSearch({provider: 'external', endpoint: '/query'}, {
            searchOptions: null,
        } as unknown as Parameters<typeof normalizeSearch>[1]),
    ).toThrow('search.options');
});
