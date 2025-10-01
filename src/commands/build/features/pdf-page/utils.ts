import type {Toc, TocItem} from '~/core/toc';
import type {SinglePageResult} from '../singlepage/utils';
import type HTMLElement from 'node-html-parser/dist/nodes/html';

import {dirname, join} from 'node:path';
import parse from 'node-html-parser';

import {
    addMainTitle,
    addPagePrefixToAnchors,
    decreaseHeadingLevels,
    getSinglePageUrl,
    tryFixFirstPageHeader,
} from '../singlepage/utils';

import {normalizePath} from '~/core/utils';


export const PDF_PAGE_FILENAME = 'pdf-page.html';

export interface PdfPageResult {
    path: string;
    content: string;
    title?: string;
}

// Let's leave the import for now; this function can be overridden later
export function getPdfPageUrl(tocDir: string, path: string): NormalizedPath {
    return getSinglePageUrl(tocDir, path, PDF_PAGE_FILENAME);
}

function elements(root: HTMLElement, selector: string): HTMLElement[] {
    return Array.from(root.querySelectorAll(selector));
}

export function replacePdfLink(root: HTMLElement, entries: string[]) {
    for (const node of elements(root, 'a:not(.yfm-anchor):not([target="_blank"])')) {
        const href = node.getAttribute('href') || '';

        if (entries.includes(href.replace('html', 'md').replace(/#.*$/, ''))) {
            node.setAttribute('href', getSinglePageUrl('.', href, PDF_PAGE_FILENAME));
        }
    }
}

const SELECTORS_TO_REMOVE = ['[data-pdf-hidden="true"]', 'inline_code_tooltip'];

function replacePdfHiddenElements(root: HTMLElement) {
    const nodesToRemove: HTMLElement[] = [];

    for (const selector of SELECTORS_TO_REMOVE) {
        nodesToRemove.push(...elements(root, selector));
    }

    for (const node of nodesToRemove) {
        node.remove();
    }
}

export function joinPdfPageResults(
    singlePageResults: SinglePageResult[],
    tocDir: NormalizedPath,
    pdfLinks: string[] = [],
): string {
    const delimeter = `<hr class="yfm-page__delimeter">`;

    return singlePageResults
        .filter(({content}) => content)
        .map(({content, path, title}) => {
            const root = parse(content);
            const options = {path, tocDir, title};

            addMainTitle(root, options);
            tryFixFirstPageHeader(root);
            addPagePrefixToAnchors(root, options);
            decreaseHeadingLevels(root);
            replacePdfLink(root, pdfLinks);
            replacePdfHiddenElements(root);

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

export function isEntryHidden(toc: Toc, entryPath: NormalizedPath): boolean {
    const result = checkItems(toc, entryPath, toc.items || [], false);

    return result === true;
}
