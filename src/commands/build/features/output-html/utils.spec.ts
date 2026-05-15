import {describe, expect, it} from 'vitest';
import MarkdownIt from 'markdown-it';
import file from '@diplodoc/transform/lib/plugins/file';

import {filterBundledExtensionAssets, getBaseMdItPlugins} from './utils';

describe('output-html utils ', () => {
    describe('getBaseMdItPlugins', () => {
        it('should include file plugin in the list', () => {
            const plugins = getBaseMdItPlugins();

            expect(plugins).toContain(file);
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
