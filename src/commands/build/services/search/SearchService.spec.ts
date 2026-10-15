import type {Run} from '~/commands/build';

import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {resolvePageResources} from '../../../../../tests/fixtures/html';

import {SearchService} from './SearchService';
import {getHooks} from './hooks';

async function renderPage(lang: string, baseHref?: string, withResources = true) {
    const service = new SearchService({
        config: {
            outputFormat: 'html',
            search: {enabled: true, provider: 'local'},
            interface: {'favicon-src': '_assets/favicon.ico'},
        },
        output: '/output',
        manifest: {
            search: {
                css: ['search.css', 'search.rtl.css'],
                js: ['vendor.js', 'search.js'],
            },
        },
        exists: () => true,
    } as unknown as Run);

    getHooks(service)
        .Provider.for('local')
        .tap('Test', () => ({
            add: async () => {},
            release: async () => {},
            config: () => ({enabled: true}),
            ...(withResources && {
                resourcesLink: (locale: string) => join('_search', locale, 'resources.js'),
            }),
        }));
    getHooks(service).Page.tap('Test.BaseHref', (template) => {
        template.setBaseHref(baseHref);
    });
    await service.init();

    return service.page(lang);
}

describe('SearchService page resources', () => {
    const deployments = [
        {name: 'absolute base', baseHref: 'https://example.com/help/docs/'},
        {name: 'relative base under a prefix', baseHref: undefined},
        {
            name: 'relative base at the origin root',
            baseHref: undefined,
            root: 'https://example.com/',
        },
    ];

    for (const lang of ['en', 'ar']) {
        it.each(deployments)(`resolves resources with $name (${lang})`, async (deployment) => {
            const root = deployment.root || 'https://example.com/help/docs/';
            const html = await renderPage(lang, deployment.baseHref);
            const pageUrl = new URL(`_search/${lang}/index.html`, root);
            const {scripts, links} = resolvePageResources(html, pageUrl);

            expect(scripts.map((url) => url.href)).toEqual([
                new URL(`_search/${lang}/resources.js`, root).href,
                new URL('_bundle/vendor.js', root).href,
                new URL('_bundle/search.js', root).href,
            ]);
            expect(links.map((url) => url.href)).toEqual([
                new URL('_assets/favicon.ico', root).href,
                new URL(`_bundle/search${lang === 'ar' ? '.rtl' : ''}.css`, root).href,
                new URL('_assets/style/theme.css', root).href,
            ]);
        });
    }

    it('supports providers without a resources script', async () => {
        const html = await renderPage('en', undefined, false);
        const pageUrl = 'https://example.com/help/docs/_search/en/index.html';
        const {scripts} = resolvePageResources(html, pageUrl);

        expect(scripts.map((url) => url.href)).toEqual([
            'https://example.com/help/docs/_bundle/vendor.js',
            'https://example.com/help/docs/_bundle/search.js',
        ]);
    });
});
