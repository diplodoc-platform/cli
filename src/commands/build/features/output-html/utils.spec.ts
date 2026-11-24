import type {Toc, TocItem} from '~/core/toc';

import {describe, expect, it, vi} from 'vitest';
import MarkdownIt from 'markdown-it';
import file from '@diplodoc/transform/lib/plugins/file';
import visibility from '@diplodoc/transform/lib/plugins/visibility';

import {getTocItemName} from '~/core/toc';
import {normalizePath} from '~/core/utils';

import {decodeAnchor, filterBundledExtensionAssets, getBaseMdItPlugins} from './utils';

describe('output-html utils ', () => {
    it('indexes each resolved TOC once and prefers visible item names', () => {
        const page = normalizePath('page.md');
        const hiddenPage = normalizePath('hidden.md');
        const items = vi.fn((): TocItem[] => [
            {
                id: 'section',
                name: 'Hidden section',
                hidden: true,
                items: [
                    {id: 'alias', name: 'Hidden alias', href: page},
                    {id: 'hidden', name: 'Hidden-only page', href: hiddenPage},
                ],
            },
            {id: 'page', name: 'Visible name', href: page},
            {id: 'duplicate', name: 'Another visible name', href: page},
        ]);
        const toc: Toc = {
            id: 'toc',
            path: normalizePath('ru/toc.yaml'),
            get items() {
                return items();
            },
        };
        const path = normalizePath('ru/page.md');

        expect(getTocItemName(toc, path)).toBe('Visible name');
        expect(getTocItemName(toc, normalizePath('ru/hidden.md'))).toBe('Hidden-only page');
        expect(getTocItemName(toc, normalizePath('ru/missing.md'))).toBeUndefined();
        expect(items).toHaveBeenCalledTimes(1);

        const reloaded: Toc = {
            id: toc.id,
            path: toc.path,
            items: [{id: 'page', name: 'Renamed page', href: page}],
        };
        expect(getTocItemName(reloaded, path)).toBe('Renamed page');
    });

    describe('decodeAnchor', () => {
        it('returns null for empty, nullish or hash-only input', () => {
            expect(decodeAnchor(null)).toBeNull();
            expect(decodeAnchor(undefined)).toBeNull();
            expect(decodeAnchor('')).toBeNull();
            expect(decodeAnchor('#')).toBeNull();
        });

        it('strips the leading hash', () => {
            expect(decodeAnchor('#anchor')).toBe('anchor');
            expect(decodeAnchor('anchor')).toBe('anchor');
        });

        it('percent-decodes non-ASCII anchors', () => {
            expect(decodeAnchor('#%D1%80%D0%B0%D0%B7%D0%B4%D0%B5%D0%BB')).toBe('раздел');
            expect(decodeAnchor('#раздел')).toBe('раздел');
        });

        it('falls back to the raw value on malformed encoding', () => {
            expect(decodeAnchor('#%E0%A4%A')).toBe('%E0%A4%A');
        });
    });

    describe('getBaseMdItPlugins', () => {
        it('should include file plugin in the list', () => {
            const plugins = getBaseMdItPlugins();

            expect(plugins).toContain(file);
        });

        it('should include audience visibility plugin in the list', () => {
            const plugins = getBaseMdItPlugins();

            expect(plugins).toContain(visibility);
        });

        it('should include multiple base plugins', () => {
            const plugins = getBaseMdItPlugins();

            expect(plugins.length).toBeGreaterThan(5);
        });
    });

    describe('filterBundledExtensionAssets', () => {
        it('should remove extension _assets/ paths from meta', () => {
            const meta = {
                script: ['_assets/cut-extension.js', '_bundle/app.js'],
                style: [
                    '_assets/cut-extension.css',
                    '_assets/tabs-extension.css',
                    '_bundle/app.css',
                ],
            };

            const result = filterBundledExtensionAssets(meta);

            expect(result.script).toEqual(['_bundle/app.js']);
            expect(result.style).toEqual(['_bundle/app.css']);
        });

        it('should not mutate the original meta object', () => {
            const meta = {
                script: ['_assets/cut-extension.js', '_bundle/app.js'],
                style: ['_bundle/app.css'],
            };

            const result = filterBundledExtensionAssets(meta);

            expect(result).not.toBe(meta);
            expect(meta.script).toEqual(['_assets/cut-extension.js', '_bundle/app.js']);
        });

        it('should keep user _assets/ files that are not extensions', () => {
            const meta = {
                script: ['_assets/custom.js'],
                style: ['_assets/my-styles.css', '_assets/file-extension.css'],
            };

            const result = filterBundledExtensionAssets(meta);

            expect(result.script).toEqual(['_assets/custom.js']);
            expect(result.style).toEqual(['_assets/my-styles.css']);
        });

        it('should handle empty or missing meta gracefully', () => {
            const result1 = filterBundledExtensionAssets({script: [], style: []});
            expect(result1.script).toEqual([]);

            const result2 = filterBundledExtensionAssets(
                {} as {script?: string[]; style?: string[]},
            );
            expect(result2.script).toBeUndefined();

            expect(filterBundledExtensionAssets(null as never)).toBeNull();
        });

        it('should filter all known extension patterns', () => {
            const meta = {
                script: [
                    '_assets/cut-extension.js',
                    '_assets/tabs-extension.js',
                    '_assets/mermaid-extension.js',
                    '_assets/latex-extension.js',
                ],
                style: [
                    '_assets/cut-extension.css',
                    '_assets/tabs-extension.css',
                    '_assets/file-extension.css',
                    '_assets/mermaid-extension.css',
                    '_assets/latex-extension.css',
                    '_assets/page-constructor-extension.css',
                ],
            };

            const result = filterBundledExtensionAssets(meta);

            expect(result.script).toEqual([]);
            expect(result.style).toEqual([]);
        });
    });

    describe('file plugin integration', () => {
        it('should process yfm_file tokens correctly', () => {
            const md = new MarkdownIt();
            md.use(file);

            const content = '{% file src="_assets/test.yaml" name="Config" %}';
            const html = md.render(content);

            expect(html).toContain('_assets/test.yaml');
        });

        it('should handle file plugin with nested paths', () => {
            const md = new MarkdownIt();
            md.use(file);

            const content = '{% file src="_assets/docs/file.pdf" name="PDF" %}';
            const html = md.render(content);

            expect(html).toContain('_assets/docs/file.pdf');
        });
    });
});
