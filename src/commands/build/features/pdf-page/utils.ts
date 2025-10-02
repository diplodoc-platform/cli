import type {Toc, TocItem} from '~/core/toc';
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

import {normalizePath} from '~/core/utils';

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
        const href = node.getAttribute('href') || '';

        if (entries.includes(href.replace('html', 'md').replace(/#.*$/, ''))) {
            node.setAttribute('href', getPdfUrl('.', href));
        }
    }
}

export function rebaseImgSrc(root: HTMLElement, base: string) {
    for (const node of elements(root, 'img')) {
        const href = node.getAttribute('src') || '';

        node.setAttribute('src', `${base}/${href}`);
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
    const delimeter = `<hr class="yfm-page__delimeter">`;

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

            return root.toString();
        })
        .join(delimeter);
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
