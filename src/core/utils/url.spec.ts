import {describe, expect, it} from 'vitest';
import {isExternalHref, prettifyLink, processAlternate} from './url';

describe('url utils', () => {
    describe('isExternalHref', () => {
        it('should return true for http and https links', () => {
            expect(isExternalHref('http://example.com')).toBe(true);
            expect(isExternalHref('https://example.com')).toBe(true);
        });

        it('should return true for protocol-relative URLs', () => {
            expect(isExternalHref('//example.com')).toBe(true);
        });

        it('should return true for custom protocols', () => {
            expect(isExternalHref('mailto:user@example.com')).toBe(true);
            expect(isExternalHref('tel:1234567890')).toBe(true);
            expect(isExternalHref('ftp://ftp.example.com')).toBe(true);
        });

        it('should return false for relative URLs', () => {
            expect(isExternalHref('/path/to/something')).toBe(false);
            expect(isExternalHref('folder/file.html')).toBe(false);
            expect(isExternalHref('./file')).toBe(false);
            expect(isExternalHref('file')).toBe(false);
        });
    });

    describe('prettifyLink', () => {
        it('should remove index.html or index from the end', () => {
            expect(prettifyLink('foo/bar/index.html')).toBe('foo/bar/');
            expect(prettifyLink('foo/bar/index')).toBe('foo/bar/');
            expect(prettifyLink('foo/index-bar/index.html')).toBe('foo/index-bar/');
            expect(prettifyLink('foo/index-bar/index')).toBe('foo/index-bar/');
            expect(prettifyLink('foo/bar-index/index.html')).toBe('foo/bar-index/');
            expect(prettifyLink('foo/bar-index/index')).toBe('foo/bar-index/');
            expect(prettifyLink('foo/bar-html/index.html')).toBe('foo/bar-html/');
            expect(prettifyLink('foo/bar-html/index')).toBe('foo/bar-html/');
            expect(prettifyLink('foo/bar-index')).toBe('foo/bar-index');
            expect(prettifyLink('foo/bar-html')).toBe('foo/bar-html');
            expect(prettifyLink('/index.html')).toBe('/');
            expect(prettifyLink('/html.html')).toBe('/html');
            expect(prettifyLink('/index')).toBe('/');
            expect(prettifyLink('index.html')).toBe('.');
            expect(prettifyLink('index')).toBe('.');
            expect(prettifyLink('./index.html')).toBe('.');
            expect(prettifyLink('./index')).toBe('.');
            expect(prettifyLink('folder/index.html')).toBe('folder/');
            expect(prettifyLink('folder/inner/index')).toBe('folder/inner/');
        });

        it('should not affect files like index-yfm.html or index-yfm', () => {
            expect(prettifyLink('foo/bar/index-yfm.html')).toBe('foo/bar/index-yfm');
            expect(prettifyLink('foo/bar/index-yfm')).toBe('foo/bar/index-yfm');
            expect(prettifyLink('index-yfm.html')).toBe('index-yfm');
            expect(prettifyLink('index-yfm')).toBe('index-yfm');
            expect(prettifyLink('http://localhost:5000/ru/index-yfm')).toBe(
                'http://localhost:5000/ru/index-yfm',
            );
        });

        it('should remove .html from filename', () => {
            expect(prettifyLink('foo/bar/test.html')).toBe('foo/bar/test');
            expect(prettifyLink('test.html')).toBe('test');
            expect(prettifyLink('/test.html')).toBe('/test');
            expect(prettifyLink('test.HTML')).toBe('test.HTML');
        });

        it('should leave other filenames unchanged', () => {
            expect(prettifyLink('foo/bar.txt')).toBe('foo/bar.txt');
            expect(prettifyLink('/foo/test')).toBe('/foo/test');
            expect(prettifyLink('some/indexing.html')).toBe('some/indexing');
            expect(prettifyLink('some/indexing')).toBe('some/indexing');
        });

        it('should handle filenames at path root', () => {
            expect(prettifyLink('file.html')).toBe('file');
            expect(prettifyLink('file')).toBe('file');
        });

        it('should handle the empty string', () => {
            expect(prettifyLink('')).toBe('.');
        });

        it('should handle slash only', () => {
            expect(prettifyLink('/')).toBe('/');
        });

        it('should preserve query and hash in path', () => {
            expect(prettifyLink('foo/bar/index.html?query=1#hash')).toBe('foo/bar/?query=1#hash');
            expect(prettifyLink('foo/bar/page.html#top')).toBe('foo/bar/page#top');
            expect(prettifyLink('foo/bar/index-yfm.html?x=1#z')).toBe('foo/bar/index-yfm?x=1#z');
            expect(prettifyLink('foo/index-yfm?param=ok')).toBe('foo/index-yfm?param=ok');
        });

        it('should handle edge cases with dots and slashes', () => {
            expect(prettifyLink('./index')).toBe('.');
            expect(prettifyLink('./index.html')).toBe('.');
            expect(prettifyLink('./folder/index')).toBe('./folder/');
            expect(prettifyLink('./folder/index.html')).toBe('./folder/');
            expect(prettifyLink('../folder/index')).toBe('../folder/');
            expect(prettifyLink('../index')).toBe('../');
        });
    });

    describe('processAlternate', () => {
        it('should extract hreflang and prefixed href', () => {
            const input = ['en/page', 'ru/page'];
            expect(processAlternate(input)).toEqual([
                {hreflang: 'en', href: './en/page'},
                {hreflang: 'ru', href: './ru/page'},
            ]);
        });

        it('should work with multiple languages and different paths', () => {
            const input = ['en/home', 'ru/main', 'fr/accueil'];
            expect(processAlternate(input)).toEqual([
                {hreflang: 'en', href: './en/home'},
                {hreflang: 'ru', href: './ru/main'},
                {hreflang: 'fr', href: './fr/accueil'},
            ]);
        });

        it('should handle single language', () => {
            const input = ['en/page'];
            expect(processAlternate(input)).toEqual([{hreflang: 'en', href: './en/page'}]);
        });

        it('should handle entries with deeper paths', () => {
            const input = ['en/docs/getting-started', 'ru/docs/getting-started'];
            expect(processAlternate(input)).toEqual([
                {hreflang: 'en', href: './en/docs/getting-started'},
                {hreflang: 'ru', href: './ru/docs/getting-started'},
            ]);
        });

        it('should work with path without slash (just lang)', () => {
            const input = ['en', 'ru'];
            expect(processAlternate(input)).toEqual([
                {hreflang: 'en', href: './en'},
                {hreflang: 'ru', href: './ru'},
            ]);
        });
    });
});
