import type {Toc} from '~/core/toc';
import type HTMLElement from 'node-html-parser/dist/nodes/html';
import type {PdfPageResult, PreprocessPdfOptions} from './utils';

import parse from 'node-html-parser';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {
    addMainTitle,
    addPagePrefixToAnchors,
    decreaseHeadingLevels,
    findCssDependencies,
    getAnchorId,
    getPdfUrl,
    isEntryHidden,
    joinPdfPageResults,
    prepareAnchorAttrs,
    removePdfHiddenElements,
    replacePdfLink,
    tryFixFirstPageHeader,
} from './utils';

vi.mock('~/core/utils', () => ({
    normalizePath: (path: string) => path as NormalizedPath,
}));

const normalizedPath = (path: string) => path as NormalizedPath;
const normalizedPaths = (paths: string[]) => paths.map((p) => normalizedPath(p));

function createHtmlWithHeaders() {
    return parse(`
        <div>
            <h1>Main Header</h1>
            <h2 id="section1">Section 1</h2>
            <h3 id="subsection">Subsection</h3>
            <a class="yfm-anchor" href="#anchor1" id="anchor1"></a>
        </div>
    `);
}

function createPdfOptions(title?: string) {
    return {
        path: 'page.md',
        tocDir: '.',
        ...(title ? {title} : {}),
    };
}

function createPdfPageResults(includeEmpty = false): PdfPageResult[] {
    const results: PdfPageResult[] = [
        {
            path: 'page1.md',
            content: '<h1>Page 1</h1><p>Content 1</p>',
            title: 'Page 1',
        },
        {
            path: 'page3.md',
            content: '<h1>Page 3</h1><p>Content 3</p>',
            title: 'Page 3',
        },
    ];

    if (includeEmpty) {
        results.splice(1, 0, {
            path: 'page2.md',
            content: '',
            title: 'Page 2',
        });
    }

    return results;
}

function createTestToc(): Toc {
    return {
        path: normalizedPath('toc.yaml'),
        title: 'Test TOC',
        id: 'test-toc',
        items: [
            {
                name: 'Visible Item',
                href: normalizedPath('visible.md'),
                id: 'visible-item',
            },
            {
                name: 'Hidden Item',
                href: normalizedPath('hidden.md'),
                hidden: true,
                id: 'hidden-item',
            },
            {
                name: 'Parent Item',
                id: 'parent-item',
                items: [
                    {
                        name: 'Child Item',
                        href: normalizedPath('child.md'),
                        id: 'child-item',
                    },
                ],
            },
            {
                name: 'Hidden Parent',
                hidden: true,
                id: 'hidden-parent',
                items: [
                    {
                        name: 'Child of Hidden',
                        href: normalizedPath('hidden-child.md'),
                        id: 'hidden-child',
                    },
                ],
            },
        ],
    };
}

describe('PDF Page Utils', () => {
    describe('addPagePrefixToAnchors', () => {
        let root: HTMLElement;
        let options: PreprocessPdfOptions;

        beforeEach(() => {
            root = createHtmlWithHeaders();
            options = createPdfOptions();
        });

        it('should add page prefix to headers', () => {
            addPagePrefixToAnchors(root, options);

            const mainHeader = root.querySelector('h1');
            expect(mainHeader?.getAttribute('data-original-article')).toBe('page.html');

            const mainHeaderAnchor = mainHeader?.querySelector('.yfm-anchor');
            expect(mainHeaderAnchor?.getAttribute('id')).toBe('page');
            expect(mainHeaderAnchor?.getAttribute('href')).toBe('#page');
        });

        it('should add page prefix to existing anchors', () => {
            const anchor = root.querySelector('.yfm-anchor');
            const originalHref = anchor?.getAttribute('href');
            const originalId = anchor?.getAttribute('id');

            addPagePrefixToAnchors(root, options);

            expect(anchor?.getAttribute('href')).toBe('#page_anchor1');
            expect(anchor?.getAttribute('id')).toBe('page_anchor1');

            expect(originalHref).not.toBe('#page_anchor1');
            expect(originalId).not.toBe('page_anchor1');
        });
    });

    describe('getPdfUrl', () => {
        it('should generate URL for simple path', () => {
            const tocDir = '.';
            const path = 'page.md';

            const result = getPdfUrl(tocDir, path);

            expect(result).toBe('#page');
        });

        it('should generate URL for path with hash', () => {
            const tocDir = '.';
            const path = 'page.md#section';

            const result = getPdfUrl(tocDir, path);

            expect(result).toBe('#page_section');
        });
    });

    describe('getAnchorId', () => {
        it('should generate ID for simple path', () => {
            const tocDir = '.';
            const path = 'page.md';

            const result = getAnchorId(tocDir, path);

            expect(result).toBe('page');
        });

        it('should generate ID for path with hash', () => {
            const tocDir = '.';
            const path = 'page.md#section';

            const result = getAnchorId(tocDir, path);

            expect(result).toBe('page_section');
        });

        it('should replace slashes and hashes with underscores', () => {
            const tocDir = '.';
            const path = '../folder/page.md#section';

            const result = getAnchorId(tocDir, path);

            expect(result).toBe('_folder_page_section');
        });
    });

    describe('replacePdfLink', () => {
        let root: HTMLElement;

        beforeEach(() => {
            root = parse(`
                <div>
                    <a href="page1.md">Link 1</a>
                    <a href="page2.md">Link 2</a>
                    <a href="page3.html">Link 3</a>
                    <a href="page4.md#section">Link 4</a>
                    <a href="https://example.com" target="_blank">External Link</a>
                    <a class="yfm-anchor" href="#anchor">Anchor</a>
                </div>
            `);
        });

        it('should replace links to files from the list', () => {
            const entries = ['page1.md', 'page2.md', 'page4.md'];

            replacePdfLink(root, entries);

            const links = Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'));

            expect(links).toEqual(
                expect.arrayContaining([
                    '#page1',
                    '#page2',
                    'page3.html',
                    '#page4_section',
                    'https://example.com',
                    '#anchor',
                ]),
            );
        });

        it('should ignore anchors and external links', () => {
            const entries = ['page1.md', 'page2.md', 'page3.html', 'page4.md'];

            replacePdfLink(root, entries);

            expect([
                root.querySelector('a[target="_blank"]')?.getAttribute('href'),
                root.querySelector('a.yfm-anchor')?.getAttribute('href'),
            ]).toEqual(['https://example.com', '#anchor']);
        });
    });

    describe('isEntryHidden', () => {
        let toc: Toc;

        beforeEach(() => {
            toc = createTestToc();
        });

        it('should return false for visible entry', () => {
            const entryPath = 'visible.md';

            const result = isEntryHidden(toc, normalizedPath(entryPath));

            expect(result).toBeFalsy();
        });

        it('should return true for hidden entry', () => {
            const entryPath = 'hidden.md';

            const result = isEntryHidden(toc, normalizedPath(entryPath));

            expect(result).toBeTruthy();
        });

        it('should return false for visible child entry', () => {
            const entryPath = 'child.md';

            const result = isEntryHidden(toc, normalizedPath(entryPath));

            expect(result).toBeFalsy();
        });

        it('should return true for child of hidden parent', () => {
            const entryPath = 'hidden-child.md';

            const result = isEntryHidden(toc, normalizedPath(entryPath));

            expect(result).toBeTruthy();
        });
    });

    describe('addMainTitle', () => {
        let root: HTMLElement;
        let options: PreprocessPdfOptions;

        beforeEach(() => {
            root = parse('<div><p>Content</p></div>');
            options = createPdfOptions('Test Title');
        });

        it('should add title when provided in options', () => {
            const initialContent = root.toString();

            addMainTitle(root, options);

            const h1 = root.querySelector('h1');
            expect(h1?.textContent).toBe('Test Title');

            expect(root.toString()).not.toBe(initialContent);
        });

        it('should not add title when not provided in options', () => {
            const initialContent = root.toString();
            const optionsWithoutTitle = createPdfOptions();

            addMainTitle(root, optionsWithoutTitle);

            expect(root.querySelector('h1')).toBeNull();

            expect(root.toString()).toBe(initialContent);
        });
    });

    describe('tryFixFirstPageHeader', () => {
        it('should change first header to h1 if it is not h1', () => {
            const root = parse('<div><h2>Header</h2><p>Content</p></div>');

            tryFixFirstPageHeader(root);

            expect(root.querySelector('h1')?.textContent).toBe('Header');

            expect(root.querySelector('h2')).toBeNull();
        });

        it('should not change first header if it is already h1', () => {
            const root = parse('<div><h1>Header</h1><p>Content</p></div>');
            const initialContent = root.toString();

            tryFixFirstPageHeader(root);

            expect(root.querySelector('h1')?.textContent).toBe('Header');

            expect(root.toString()).toBe(initialContent);
        });

        it('should do nothing if there are no headers', () => {
            const root = parse('<div><p>Content</p></div>');
            const initialContent = root.toString();

            tryFixFirstPageHeader(root);

            expect(root.querySelector('h1')).toBeNull();
            expect(root.querySelector('h2')).toBeNull();

            expect(root.toString()).toBe(initialContent);
        });
    });

    describe('decreaseHeadingLevels', () => {
        it('should decrease heading levels by 1', () => {
            const root = parse(`
                <div>
                    <h1>Header 1</h1>
                    <h2>Header 2</h2>
                    <h3>Header 3</h3>
                    <h4>Header 4</h4>
                    <h5>Header 5</h5>
                </div>
            `);

            decreaseHeadingLevels(root);

            expect(root.querySelector('h1')).toBeNull();

            expect(root.querySelector('h2')?.textContent.trim()).toBe('Header 1');
            expect(root.querySelector('h3')?.textContent.trim()).toBe('Header 2');
            expect(root.querySelector('h4')?.textContent.trim()).toBe('Header 3');
            expect(root.querySelector('h5')?.textContent.trim()).toBe('Header 4');
            expect(root.querySelector('h6')?.textContent.trim()).toBe('Header 5');
        });
    });

    describe('joinPdfPageResults', () => {
        it('should join PDF page results with delimiters', () => {
            const pdfPageResults = createPdfPageResults();
            const tocDir = '.';
            const pdfLinks = ['page1.md', 'page3.md'];

            const result = joinPdfPageResults(
                pdfPageResults,
                normalizedPath(tocDir),
                normalizedPaths(pdfLinks),
            );

            expect(result).toMatch(
                /Page 1.*Content 1.*<div class="pdf-page-wrapper" data-page-break="true">.*Page 3.*Content 3/s,
            );
        });

        it('should filter out pages with empty content', () => {
            const pdfPageResults = createPdfPageResults(true);
            const tocDir = '.';
            const pdfLinks = ['page1.md', 'page2.md', 'page3.md'];

            const result = joinPdfPageResults(
                pdfPageResults,
                normalizedPath(tocDir),
                normalizedPaths(pdfLinks),
            );

            expect(result).toMatch(
                /Page 1.*Content 1.*<div class="pdf-page-wrapper" data-page-break="true">.*Page 3.*Content 3/s,
            );
            expect(result).not.toContain('Page 2');
        });
    });

    describe('prepareAnchorAttrs', () => {
        it('should prepare href attribute', () => {
            const node = parse('<a href="#section">Link</a>').querySelector('a');
            const pathname = '';
            const page = 'page';

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            prepareAnchorAttrs(node!, pathname, page);

            expect(node?.getAttribute('href')).toBe('#page_section');
        });

        it('should prepare id attribute', () => {
            const node = parse('<a id="section">Link</a>').querySelector('a');
            const pathname = '';
            const page = 'page';

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            prepareAnchorAttrs(node!, pathname, page);

            expect(node?.getAttribute('id')).toBe('page_section');
        });

        it('should prepare both href and id attributes', () => {
            const node = parse('<a href="#section" id="section">Link</a>').querySelector('a');
            const pathname = '';
            const page = 'page';

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            prepareAnchorAttrs(node!, pathname, page);

            const attributes = {
                href: node?.getAttribute('href'),
                id: node?.getAttribute('id'),
            };

            expect(attributes).toEqual({
                href: '#page_section',
                id: 'page_section',
            });
        });

        it('should handle href without hash', () => {
            const node = parse('<a href="section">Link</a>').querySelector('a');
            const pathname = '';
            const page = 'page';

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            prepareAnchorAttrs(node!, pathname, page);

            expect(node?.getAttribute('href')).toBe('#page_section');
        });
    });

    describe('removePdfHiddenElements', () => {
        it('should remove elements with data-pdf-hidden="true"', () => {
            const root = parse(`
                <div>
                    <p>Visible content</p>
                    <div data-pdf-hidden="true">Hidden content</div>
                    <p>More visible content</p>
                </div>
            `);

            removePdfHiddenElements(root);

            expect(root.querySelector('[data-pdf-hidden="true"]')).toBeNull();

            const content = root.textContent.trim().replace(/\s+/g, ' ');
            expect(content).toBe('Visible content More visible content');
        });

        it('should remove elements with class "inline_code_tooltip"', () => {
            const root = parse(`
                <div>
                    <p>Visible content</p>
                    <span class="inline_code_tooltip">Tooltip</span>
                    <p>More visible content</p>
                </div>
            `);

            removePdfHiddenElements(root);

            expect(root.querySelector('.inline_code_tooltip')).toBeNull();

            const content = root.textContent.trim().replace(/\s+/g, ' ');
            expect(content).toBe('Visible content More visible content');
        });
    });

    describe('findCssDependencies', () => {
        it('should find only local CSS url() dependencies and ignore external/data/variable URLs', () => {
            const cssContent = `
                .background { background-image: url('./images/bg.jpg'); }
                .icon { background: url("../icons/icon.png"); }
                .font { src: url(fonts/font.woff2); }
                .duplicate { background: url('./images/bg.jpg'); }
                .external { background: url('https://example.com/image.jpg'); }
                .protocol { background: url('http://site.com/pic.png'); }
                .data-uri { background: url('data:image/svg+xml;base64,PHN2Zz4='); }
                .variable { background: url(var(--image-url)); }
                .no-deps { color: red; font-size: 16px; }
            `;
            const cssPath = normalizedPath('styles/main.css');

            const result = findCssDependencies(cssContent, cssPath);

            expect(result.map((r) => r.path.replace(/\\/g, '/'))).toEqual([
                'styles/images/bg.jpg',
                'icons/icon.png',
                'styles/fonts/font.woff2',
            ]);
        });
    });
});
