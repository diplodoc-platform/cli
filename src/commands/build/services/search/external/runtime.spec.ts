import {afterEach, describe, expect, it, vi} from 'vitest';

import {createExternalSearchApi} from './runtime';

const item = {title: 'Guide', url: '/docs/en/guide.html', description: 'A guide'};
const result = {items: [item], total: 21, tagCounts: {guide: 21}};

function setup(endpoint = 'https://search.example.test/query?index=docs', options = {}) {
    const fetch = vi.fn().mockResolvedValue({ok: true, json: async () => result});
    vi.stubGlobal('fetch', fetch);
    return {
        fetch,
        api: createExternalSearchApi({
            endpoint,
            options,
            lang: 'en',
            base: 'https://docs.example.test/product/v1',
        }),
    };
}

afterEach(() => vi.unstubAllGlobals());

describe('external HTTP search', () => {
    it('encodes queries, pagination, language, repeated tags and public options', async () => {
        const {api, fetch} = setup(undefined, {
            version: 'v1',
            page: 99,
            query: 'override',
            tags: 'override',
        });
        await expect(api.search('a & б?', 5, 3, ['api ref', 'a&b'])).resolves.toEqual(result);
        const url = new URL(fetch.mock.calls[0][0]);
        expect(url.origin + url.pathname).toBe('https://search.example.test/query');
        expect(Object.fromEntries(url.searchParams)).toMatchObject({
            index: 'docs',
            version: 'v1',
            query: 'a & б?',
            count: '5',
            page: '3',
            lang: 'en',
        });
        expect(url.searchParams.getAll('tags')).toEqual(['api ref', 'a&b']);
    });

    it.each([
        ['/query', 'https://docs.example.test/query'],
        ['query', 'https://docs.example.test/product/v1/query'],
        ['https://search.example.test/query', 'https://search.example.test/query'],
    ])('resolves endpoint %s relative to the published docs root', async (endpoint, expected) => {
        const {api, fetch} = setup(endpoint);
        await api.search('text', 10, 1);
        const url = new URL(fetch.mock.calls[0][0]);
        expect(url.origin + url.pathname).toBe(expected);
        expect(url.searchParams.has('tags')).toBe(false);
    });

    it('turns first-page results into suggestions for the existing UI', async () => {
        const {api, fetch} = setup();
        await expect(api.suggest('guide', 4)).resolves.toEqual([
            {type: 'page', link: item.url, title: item.title, description: item.description},
        ]);
        const url = new URL(fetch.mock.calls[0][0]);
        expect(url.searchParams.get('count')).toBe('4');
        expect(url.searchParams.get('page')).toBe('1');
    });

    it('rejects non-success HTTP responses', async () => {
        const {api, fetch} = setup();
        fetch.mockResolvedValue({ok: false, status: 503});
        await expect(api.search('guide', 10, 1)).rejects.toThrow('503');
    });

    it.each([
        null,
        {},
        {items: {}, total: 1},
        {items: [], total: -1},
        {items: [], total: '1'},
        {items: [{}], total: 1},
        {items: [], total: 0, tagCounts: {api: -1}},
    ])('rejects invalid responses %j', async (body) => {
        const {api, fetch} = setup();
        fetch.mockResolvedValue({ok: true, json: async () => body});
        await expect(api.search('guide', 10, 1)).rejects.toThrow(
            'Invalid external search response',
        );
    });
});
