import type {Toc, TocItem} from '~/core/toc';
import type {AssetInfo} from '~/core/markdown/types';
import type HTMLElement from 'node-html-parser/dist/nodes/html';

import {dirname, join} from 'node:path';
import parse from 'node-html-parser';

const HEADERS_SELECTOR = 'h1, h2, h3, h4, h5, h6';
const SELECTORS_TO_REMOVE_IN_PDF = ['.inline_code_tooltip', '[data-pdf-hidden="true"]'];

export const PDF_PAGE_FILENAME = 'pdf-page.html';

export interface PreprocessPdfOptions {
    path: string;
    tocDir: string;
    title?: string;
}

export interface PdfPageResult {
    path: string;
    content: string;
    title?: string;
}

import {isExternalHref, normalizePath} from '~/core/utils';

export interface PdfPageResult {
    path: string;
    content: string;
    title?: string;
}

export function getPdfUrl(tocDir: string, path: string): NormalizedPath {
    const suffix = getAnchorId(tocDir, path);

    return ('#' + suffix) as NormalizedPath;
}

export function getAnchorId(tocDir: string, path: string) {
    const [pathname, hash] = path.split('#');
    const url = normalizePath(dropExt(pathname)) + (hash ? '#' + hash : '');

    // TODO: encodeURIComponent will be best option
    return relativeTo(tocDir, url.replace(/\.\.\/|[/#]/g, '_'));
}

export function replacePdfLink(root: HTMLElement, entries: string[]) {
    for (const node of elements(root, 'a:not(.yfm-anchor):not([target="_blank"])')) {
        // Dummy way to fix bug which originally belongs to MD parser
        // TODO: fix transform method packages/cli/src/commands/build/run.ts -> packages/transform/src/transform/md.ts:140
        const href = (node.getAttribute('href') || '').replace(/(\/[^/]+)\1+/g, '$1');

        if (entries.includes(href.replace('html', 'md').replace(/#.*$/, ''))) {
            node.setAttribute('href', getPdfUrl('.', href));
        }
    }
}

export function replacePCNestedLinks(html: string) {
    const root = parse(html);

    for (const node of elements(root, 'a:not(a a)')) {
        const innerLinks = node.querySelectorAll('a');

        if (innerLinks.length === 0) {
            continue;
        }

        for (const link of innerLinks) {
            const innerHtml = link.innerHTML;

            const attributes = link.attributes;

            const attrsString = Object.entries(attributes)
                .map(([key, value]) => `${key}="${value}"`)
                .join(' ');

            const spanHtml = `<span ${attrsString}>${innerHtml}</span>`;

            link.replaceWith(spanHtml);
        }
    }

    return root.toString();
}

export function rebaseImgSrc(root: HTMLElement, base: string) {
    for (const node of elements(root, 'img')) {
        const href = node.getAttribute('src') || '';

        if (!isExternalHref(href)) {
            node.setAttribute('src', `${base}/${href}`);
        }
    }
}

export function isEntryHidden(toc: Toc, entryPath: NormalizedPath): boolean {
    const result = checkItems(toc, entryPath, toc.items || [], false);

    return result === true;
}

export function addMainTitle(root: HTMLElement, options: PreprocessPdfOptions) {
    if (options.title) {
        root.insertAdjacentHTML('afterbegin', `<h1>${options.title}</h1>`);
    }
}

export function tryFixFirstPageHeader(root: HTMLElement) {
    const firstPageHeader = root.querySelector(HEADERS_SELECTOR);
    if (!firstPageHeader || firstPageHeader.rawTagName === 'h1') {
        return;
    }

    firstPageHeader.rawTagName = 'h1';
}

export function decreaseHeadingLevels(root: HTMLElement) {
    const headersSelector = 'h1, h2, h3, h4, h5';

    root.querySelectorAll(headersSelector).forEach((node) => {
        const {rawTagName} = node;
        const newHeadingLevel = Number(rawTagName.charAt(1)) + 1;

        node.rawTagName = `h${newHeadingLevel}`;
    });
}

export function addPagePrefixToAnchors(root: HTMLElement, options: PreprocessPdfOptions) {
    const {path} = options;

    const url = getPdfUrl('.', path);
    const [pathname, anchor] = url.split('#');

    for (const node of elements(root, HEADERS_SELECTOR)) {
        prepareAnchorAttrs(node, pathname, anchor);
    }

    // Add the page prefix id to all existing anchors
    for (const node of elements(root, '.yfm-anchor')) {
        prepareAnchorAttrs(node, pathname, anchor);
    }

    const mainHeader = root.querySelector('h1');
    if (mainHeader) {
        const node = parse(
            `<a class="yfm-anchor" aria-hidden="true" href="${url}" id="${anchor}"></a>`,
        );

        mainHeader.setAttribute('data-original-article', `${dropExt(path)}.html`);
        mainHeader.appendChild(node);
    }
}

export function joinPdfPageResults(
    pdfPageResults: PdfPageResult[],
    tocDir: NormalizedPath,
    pdfLinks: NormalizedPath[],
): string {
    return pdfPageResults
        .filter(({content}) => content)
        .map(({content, path, title}) => {
            const root = parse(content);
            const options = {path, tocDir, title};

            removePdfHiddenElements(root);
            addMainTitle(root, options);
            tryFixFirstPageHeader(root);
            addPagePrefixToAnchors(root, options);
            decreaseHeadingLevels(root);
            replacePdfLink(root, pdfLinks);
            rebaseImgSrc(root, '..');

            return `<div class="pdf-page-wrapper" data-page-break="true">${root.toString()}</div>`;
        })
        .join('');
}

function checkItems(
    toc: Toc,
    entryPath: string,
    items: TocItem[],
    parentHidden: boolean,
): boolean | null {
    if (!items) {
        return null;
    }

    for (const item of items) {
        const isCurrentHidden = item.hidden || parentHidden;

        if (item.href) {
            const itemPath = normalizePath(join(dirname(toc.path), item.href));

            if (itemPath === entryPath) {
                return isCurrentHidden;
            }
        }

        if (item.items && item.items.length > 0) {
            const result = checkItems(toc, entryPath, item.items, isCurrentHidden);

            if (result !== null) {
                return result;
            }
        }
    }

    return null;
}

function dropExt(path: string) {
    return path.replace(/\.(md|ya?ml|html)$/i, '');
}

function relativeTo(root: string, path: string) {
    root = normalizePath(root);
    path = normalizePath(path);

    if (root && path.startsWith(root + '/')) {
        path = path.replace(root + '/', '');
    }

    return path;
}

function elements(root: HTMLElement, selector: string): HTMLElement[] {
    return Array.from(root.querySelectorAll(selector));
}

export function removePdfHiddenElements(root: HTMLElement) {
    const nodes = [];

    for (const selector of SELECTORS_TO_REMOVE_IN_PDF) {
        const selected = elements(root, selector);
        nodes.push(...selected);
    }

    for (const node of nodes) {
        node.remove();
    }
}

/**
 * Finds dependencies in CSS file by url() directives.
 *
 * @param cssContent - CSS file content
 * @param cssFilePath - CSS file path for proper relative path resolution
 * @returns Array of AssetInfo objects for found dependencies
 */
export function findCssDependencies(cssContent: string, cssFilePath: RelativePath): AssetInfo[] {
    const dependencies: AssetInfo[] = [];
    const seenPaths = new Set<string>();
    const urlRegex = /url\s*\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
    let urlMatch;

    while ((urlMatch = urlRegex.exec(cssContent)) !== null) {
        const url = urlMatch[2].trim();

        if (
            !url.startsWith('http') &&
            !url.startsWith('//') &&
            !url.startsWith('data:') &&
            !url.includes('var(') &&
            !url.includes('${') &&
            !url.startsWith('*') &&
            !url.includes('%')
        ) {
            const decodedUrl = decodeURIComponent(url) as RelativePath;
            const resolvedPath = rebasePath(cssFilePath, decodedUrl);

            if (seenPaths.has(resolvedPath)) {
                continue;
            }
            seenPaths.add(resolvedPath);

            const assetInfo: AssetInfo = {
                path: resolvedPath as NormalizedPath,
                type: 'image',
                subtype: 'image',
                title: '',
                autotitle: false,
                hash: null,
                search: null,
                location: [urlMatch.index, urlRegex.lastIndex],
                options: {
                    width: undefined,
                    height: undefined,
                    inline: false,
                },
            };

            dependencies.push(assetInfo);
        }
    }

    return dependencies;
}

function rebasePath(root: RelativePath, path: RelativePath): string {
    return normalizePath(join(dirname(root), path));
}

export function prepareAnchorAttrs(node: HTMLElement, pathname: string, page: string) {
    for (const [name, value] of Object.entries(node.attributes)) {
        if (name === 'href') {
            const anchor = value.split('#')[1] || value;
            node.setAttribute(name, `${pathname}#${page}_${anchor}`);
        }

        if (name === 'id') {
            node.setAttribute(name, `${page}_${value}`);
        }
    }
}
