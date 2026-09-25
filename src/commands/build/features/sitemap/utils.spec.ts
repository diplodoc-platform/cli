import {describe, expect, it} from 'vitest';

import {generateSitemap} from './utils';

describe('generateSitemap', () => {
    it('generates an empty urlset for no urls', () => {
        expect(generateSitemap([])).toBe(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '</urlset>',
            ].join('\n'),
        );
    });

    it('wraps every url into a loc entry', () => {
        expect(generateSitemap(['https://example.com/docs/index.html'])).toBe(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '    <url>',
                '        <loc>https://example.com/docs/index.html</loc>',
                '    </url>',
                '</urlset>',
            ].join('\n'),
        );
    });

    it('sorts urls and drops duplicates', () => {
        const xml = generateSitemap([
            'https://example.com/docs/b.html',
            'https://example.com/docs/a.html',
            'https://example.com/docs/b.html',
        ]);

        const locs = xml.match(/<loc>(.*?)<\/loc>/g) ?? [];

        expect(locs).toEqual([
            '<loc>https://example.com/docs/a.html</loc>',
            '<loc>https://example.com/docs/b.html</loc>',
        ]);
    });

    it('escapes xml special characters', () => {
        const xml = generateSitemap(['https://example.com/docs/page.html?a=1&b=2']);

        expect(xml).toContain('<loc>https://example.com/docs/page.html?a=1&amp;b=2</loc>');
    });
});
