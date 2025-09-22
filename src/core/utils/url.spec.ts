import {describe, expect, it} from 'vitest';

import {isExternalHref, shortLink} from './url';

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
            expect(shortLink('foo/bar/index.html')).toBe('foo/bar/');
            expect(shortLink('foo/bar/index')).toBe('foo/bar/');
            expect(shortLink('foo/index-bar/index.html')).toBe('foo/index-bar/');
            expect(shortLink('foo/index-bar/index')).toBe('foo/index-bar/');
            expect(shortLink('foo/bar-index/index.html')).toBe('foo/bar-index/');
            expect(shortLink('foo/bar-index/index')).toBe('foo/bar-index/');
            expect(shortLink('foo/bar-html/index.html')).toBe('foo/bar-html/');
            expect(shortLink('foo/bar-html/index')).toBe('foo/bar-html/');
            expect(shortLink('foo/bar-index')).toBe('foo/bar-index');
            expect(shortLink('foo/bar-html')).toBe('foo/bar-html');
            expect(shortLink('/index.html')).toBe('/');
            expect(shortLink('/html.html')).toBe('/html');
            expect(shortLink('/index')).toBe('/');
            expect(shortLink('index.html')).toBe('.');
            expect(shortLink('index')).toBe('.');
            expect(shortLink('./index.html')).toBe('.');
            expect(shortLink('./index')).toBe('.');
            expect(shortLink('folder/index.html')).toBe('folder/');
            expect(shortLink('folder/inner/index')).toBe('folder/inner/');
        });

        it('should not affect files like index-yfm.html or index-yfm', () => {
            expect(shortLink('foo/bar/index-yfm.html')).toBe('foo/bar/index-yfm');
            expect(shortLink('foo/bar/index-yfm')).toBe('foo/bar/index-yfm');
            expect(shortLink('index-yfm.html')).toBe('index-yfm');
            expect(shortLink('index-yfm')).toBe('index-yfm');
            expect(shortLink('http://localhost:5000/ru/index-yfm')).toBe(
                'http://localhost:5000/ru/index-yfm',
            );
        });

        it('should remove .html from filename', () => {
            expect(shortLink('foo/bar/test.html')).toBe('foo/bar/test');
            expect(shortLink('test.html')).toBe('test');
            expect(shortLink('/test.html')).toBe('/test');
            expect(shortLink('test.HTML')).toBe('test.HTML');
        });

        it('should leave other filenames unchanged', () => {
            expect(shortLink('foo/bar.txt')).toBe('foo/bar.txt');
            expect(shortLink('/foo/test')).toBe('/foo/test');
            expect(shortLink('some/indexing.html')).toBe('some/indexing');
            expect(shortLink('some/indexing')).toBe('some/indexing');
        });

        it('should handle filenames at path root', () => {
            expect(shortLink('file.html')).toBe('file');
            expect(shortLink('file')).toBe('file');
        });

        it('should handle the empty string', () => {
            expect(shortLink('')).toBe('.');
        });

        it('should handle slash only', () => {
            expect(shortLink('/')).toBe('/');
        });

        it('should preserve query and hash in path', () => {
            expect(shortLink('foo/bar/index.html?query=1#hash')).toBe('foo/bar/?query=1#hash');
            expect(shortLink('foo/bar/page.html#top')).toBe('foo/bar/page#top');
            expect(shortLink('foo/bar/index-yfm.html?x=1#z')).toBe('foo/bar/index-yfm?x=1#z');
            expect(shortLink('foo/index-yfm?param=ok')).toBe('foo/index-yfm?param=ok');
        });

        it('should handle edge cases with dots and slashes', () => {
            expect(shortLink('./index')).toBe('.');
            expect(shortLink('./index.html')).toBe('.');
            expect(shortLink('./folder/index')).toBe('./folder/');
            expect(shortLink('./folder/index.html')).toBe('./folder/');
            expect(shortLink('../folder/index')).toBe('../folder/');
            expect(shortLink('../index')).toBe('../');
        });
    });
});
