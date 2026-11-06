import type {EntryInfo, Run} from '~/commands/build';

import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';

import {Template} from '~/core/template';

import {ExternalSearchProvider} from './index';

function setup(skipHtmlExtension = false) {
    const run = {
        output: '/output',
        assetsPath: '/assets',
        config: {
            search: {
                enabled: true,
                provider: 'external',
                endpoint: 'https://search.example.test/query',
                options: {version: 'v1'},
                secret: 'never-publish',
            },
            skipHtmlExtension,
        },
        copy: vi.fn(),
        write: vi.fn(),
        search: {page: vi.fn(async (lang) => `<html>${lang}</html>`)},
    };
    return {run, provider: new ExternalSearchProvider(run as unknown as Run)};
}

describe('external search build provider', () => {
    it('publishes only the public contract and result links', () => {
        const {provider} = setup();
        expect(provider.config('ru')).toEqual({
            enabled: true,
            provider: 'external',
            api: '_search/external-api.js',
            endpoint: 'https://search.example.test/query',
            options: {version: 'v1'},
            link: '_search/ru/index.html',
        });
        expect(setup(true).provider.config('en').link).toBe('_search/en/');
    });
    it('writes result pages for all observed languages without fetching the backend', async () => {
        const {run, provider} = setup();
        await provider.add('en/index.md' as NormalizedPath, 'en', {} as EntryInfo);
        await provider.add('ru/index.md' as NormalizedPath, 'ru', {} as EntryInfo);
        await provider.add('en/guide.md' as NormalizedPath, 'en', {} as EntryInfo);
        await provider.release();
        expect(run.copy).toHaveBeenCalledWith(
            join('/assets', 'external-search/api.js'),
            join('/output', '_search/external-api.js'),
        );
        expect(run.write.mock.calls).toEqual([
            [join('/output', '_search/en/index.html'), '<html>en</html>', true],
            [join('/output', '_search/ru/index.html'), '<html>ru</html>', true],
        ]);
    });
    it('permits workers without restricting existing connections', () => {
        const {provider} = setup();
        const template = new Template('en/index.html' as RelativePath, 'en');
        provider.configurePage(template);
        const html = template.dump();
        expect(html).toContain("worker-src 'self'");
        expect(html).not.toContain('connect-src');
    });
});

describe('external search tags', () => {
    it('collects public tags by language for the results filter', async () => {
        const {provider} = setup();
        const add = (lang: string, meta: object) =>
            provider.add('page.md' as NormalizedPath, lang, {meta} as EntryInfo);
        await add('en', {tags: ['guide', '_technical', 'api']});
        await add('en', {tags: ['guide']});
        await add('en', {tags: ['private'], noIndex: true});
        await add('ru', {tags: ['manual']});
        expect(provider.config('en')).toMatchObject({tags: ['guide', 'api']});
        expect(provider.config('ru')).toMatchObject({tags: ['manual']});
    });
});
