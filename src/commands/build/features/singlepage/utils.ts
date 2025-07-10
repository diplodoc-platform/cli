import type HTMLElement from 'node-html-parser/dist/nodes/html';

import {dirname, join} from 'node:path';
import {parse} from 'node-html-parser';

import {normalizePath} from '~/core/utils';

const HEADERS_SELECTOR = 'h1, h2, h3, h4, h5, h6';

export interface SinglePageResult {
    path: string;
    content: string;
    title?: string;
}

interface PreprocessSinglePageOptions {
    path: string;
    tocDir: string;
    title?: string;
}

function dropExt(path: string) {
    return path.replace(/\.(md|ya?ml|html)$/i, '');
}

function getAnchorId(tocDir: string, path: string) {
    const [pathname, hash] = path.split('#');
    const url = normalizePath(dropExt(pathname)) + (hash ? '#' + hash : '');

    // TODO: encodeURIComponent will be best option
    return relativeTo(tocDir, url.replace(/\.\.\/|[/#]/g, '_'));
}

function relativeTo(root: string, path: string) {
    root = normalizePath(root);
    path = normalizePath(path);

    if (root && path.startsWith(root + '/')) {
        path = path.replace(root + '/', '');
    }

    return path;
}

export function getSinglePageUrl(tocDir: string, path: string): NormalizedPath {
    const prefix = normalizePath(tocDir) || '.';
    const suffix = getAnchorId(tocDir, path);

    if (prefix === '.') {
        return ('#' + suffix) as NormalizedPath;
    }

    return normalizePath(join(prefix, 'single-page.html#' + suffix));
}

function elements(root: HTMLElement, selector: string): HTMLElement[] {
    return Array.from(root.querySelectorAll(selector));
}

export function decreaseHeadingLevels(root: HTMLElement) {
    const headersSelector = 'h1, h2, h3, h4, h5';

    root.querySelectorAll(headersSelector).forEach((node) => {
        const {rawTagName} = node;
        const newHeadingLevel = Number(rawTagName.charAt(1)) + 1;

        node.rawTagName = `h${newHeadingLevel}`;
    });
}

export function tryFixFirstPageHeader(root: HTMLElement) {
    const firstPageHeader = root.querySelector(HEADERS_SELECTOR);
    if (!firstPageHeader || firstPageHeader.rawTagName === 'h1') {
        return;
    }

    firstPageHeader.rawTagName = 'h1';
}

export function replaceLinks(root: HTMLElement, options: PreprocessSinglePageOptions) {
    const {path, tocDir} = options;

    for (const node of elements(root, 'a:not(.yfm-anchor):not([target="_blank"])')) {
        const href = node.getAttribute('href') || '';
        const linkFullPath = normalizePath(join(dirname(path), href));

        // TODO: isLinkOutOfToc is wrong check
        // we need to to something like TocService.getForPath
        // and then compare with local toc path.
        const isLinkOutOfToc = !linkFullPath.startsWith(tocDir);
        const isLinkOutOfRoot = linkFullPath.startsWith('../');

        if (isLinkOutOfToc || isLinkOutOfRoot) {
            return;
        }

        node.setAttribute('href', getSinglePageUrl(tocDir, href));
    }
}

function prepareAnchorAttrs(node: HTMLElement, pathname: string, page: string) {
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

export function addPagePrefixToAnchors(root: HTMLElement, options: PreprocessSinglePageOptions) {
    const {path, tocDir} = options;

    const url = getSinglePageUrl(tocDir, path);
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

export function addMainTitle(root: HTMLElement, options: PreprocessSinglePageOptions) {
    if (options.title) {
        root.insertAdjacentHTML('afterbegin', `<h1>${options.title}</h1>`);
    }
}

export function joinSinglePageResults(
    singlePageResults: SinglePageResult[],
    tocDir: NormalizedPath,
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
            replaceLinks(root, options);

            return root.toString();
        })
        .join(delimeter);
}
