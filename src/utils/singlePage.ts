import type {SinglePageResult} from '~/models';

import HTMLElement from 'node-html-parser/dist/nodes/html';
import {parse} from 'node-html-parser';
import {dirname, join} from 'path';

import {getSinglePageUrl} from '../commands/build/features/singlepage/utils';

interface PreprocessSinglePageOptions {
    path: string;
    tocDir: string;
    title?: string;
}

const HEADERS_SELECTOR = 'h1, h2, h3, h4, h5, h6';

function dropExt(path: string) {
    return path.replace(/\.(md|ya?ml|html)$/i, '');
}

function toUrl(path: string) {
    // replace windows backslashes
    return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function all(root: HTMLElement, selector: string): HTMLElement[] {
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

    for (const node of all(root, 'a:not(.yfm-anchor):not([target="_blank"])')) {
        const href = node.getAttribute('href') || '';
        const linkFullPath = toUrl(join(dirname(path), href));

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

    for (const node of all(root, HEADERS_SELECTOR)) {
        prepareAnchorAttrs(node, pathname, anchor);
    }

    // Add the page prefix id to all existing anchors
    for (const node of all(root, '.yfm-anchor')) {
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
    tocDir: string,
): string {
    const delimeter = `<hr class="yfm-page__delimeter">`;

    tocDir = toUrl(tocDir);

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
