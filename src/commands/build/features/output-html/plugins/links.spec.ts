import {describe, expect, it} from 'vitest';
import MarkdownIt from 'markdown-it';
import file from '@diplodoc/transform/lib/plugins/file';

import linksPlugin from './links';

describe('Links plugin', () => {
    function createMarkdownIt(entries: string[] = []) {
        const md = new MarkdownIt({html: true});
        md.use(file);
        md.use(linksPlugin, {
            path: 'index.md',
            root: '',
            directoryPath: '',
            existsInProject: (path: string) => entries.includes(path),
            entries,
        });
        return md;
    }

    describe('_assets directory links', () => {
        it('should preserve _assets link paths without html conversion', () => {
            const md = createMarkdownIt(['_assets/test.yaml']);

            const html = md.render('[Download](_assets/test.yaml)');

            expect(html).toContain('href="_assets/test.yaml"');
            expect(html).not.toContain('_assets/test.html');
        });

        it('should preserve _assets links with hash fragments', () => {
            const md = createMarkdownIt(['_assets/test.yaml']);

            const html = md.render('[Download](_assets/test.yaml#section)');

            expect(html).toContain('href="_assets/test.yaml#section"');
            expect(html).not.toContain('.html');
        });

        it('should preserve _assets links with query parameters', () => {
            const md = createMarkdownIt(['_assets/test.yaml']);

            const html = md.render('[Download](_assets/test.yaml?version=1)');

            expect(html).toContain('href="_assets/test.yaml?version=1"');
            expect(html).not.toContain('.html');
        });

        it('should preserve _assets links with both query and hash', () => {
            const md = createMarkdownIt(['_assets/test.yaml']);

            const html = md.render('[Download](_assets/test.yaml?v=1#section)');

            expect(html).toContain('href="_assets/test.yaml?v=1#section"');
            expect(html).not.toContain('.html');
        });

        it('should set YFM003 error attribute for missing _assets file', () => {
            const md = createMarkdownIt([]);

            const tokens = md.parse('[Download](_assets/missing.yaml)', {});

            const linkToken = tokens
                .find((t) => t.type === 'inline')
                ?.children?.find((t) => t.type === 'link_open');
            expect(linkToken?.attrGet('YFM003')).toBe('file-not-found');
        });

        it('should not set error for existing _assets file', () => {
            const md = createMarkdownIt(['_assets/test.yaml']);

            const tokens = md.parse('[Download](_assets/test.yaml)', {});

            const linkToken = tokens
                .find((t) => t.type === 'inline')
                ?.children?.find((t) => t.type === 'link_open');
            expect(linkToken?.attrGet('YFM003')).toBeNull();
        });
    });

    describe('HTML download attribute', () => {
        it('should preserve HTML links with download attribute', () => {
            const md = createMarkdownIt(['_assets/test.yaml']);

            const html = md.render('<a href="_assets/test.yaml" download="Config">Download</a>');

            expect(html).toContain('href="_assets/test.yaml"');
            expect(html).toContain('download="Config"');
        });

        it('should preserve non-assets files with download attribute', () => {
            const md = createMarkdownIt(['docs/file.pdf']);

            const html = md.render('<a href="docs/file.pdf" download>Download</a>');

            expect(html).toContain('href="docs/file.pdf"');
            expect(html).toContain('download');
        });

        it('should set error for missing file with download attribute', () => {
            const md = createMarkdownIt([]);

            const html = md.render('<a href="missing.pdf" download>Download</a>');

            expect(html).toContain('href="missing.pdf"');
        });
    });

    describe('yfm file plugin integration', () => {
        it('should preserve file plugin links without html conversion', () => {
            const md = createMarkdownIt(['_assets/test.yaml']);

            const html = md.render('{% file src="_assets/test.yaml" name="Config" %}');

            expect(html).toContain('_assets/test.yaml');
            expect(html).not.toContain('.html');
        });

        it('should handle file plugin with missing file', () => {
            const md = createMarkdownIt([]);

            const html = md.render('{% file src="_assets/missing.txt" name="File" %}');

            expect(html).toContain('_assets/missing.txt');
        });

        it('should handle file plugin with nested path', () => {
            const md = createMarkdownIt(['_assets/docs/file.pdf']);

            const html = md.render('{% file src="_assets/docs/file.pdf" name="PDF" %}');

            expect(html).toContain('_assets/docs/file.pdf');
        });
    });

    describe('regular markdown links', () => {
        it('should convert markdown file links to html', () => {
            const md = createMarkdownIt(['page.md']);

            const html = md.render('[Link](page.md)');

            expect(html).toContain('href="page.html"');
            expect(html).not.toContain('page.md');
        });

        it('should convert yaml file links to html', () => {
            const md = createMarkdownIt(['page.yaml']);

            const html = md.render('[Link](page.yaml)');

            expect(html).toContain('href="page.html"');
        });

        it('should not modify external links', () => {
            const md = createMarkdownIt();

            const html = md.render('[External](https://example.com/file.md)');

            expect(html).toContain('href="https://example.com/file.md"');
            expect(html).not.toContain('.html');
        });
    });
});
