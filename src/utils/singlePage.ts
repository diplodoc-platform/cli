import HTMLElement from 'node-html-parser/dist/nodes/html';
import {parse} from 'node-html-parser';
import {resolve, sep, relative} from 'path';
import {resolveRelativePath} from '@diplodoc/transform/lib/utilsFS';
import url from 'url';
import _ from 'lodash';

import {isExternalHref} from './url';

interface ModifyNode {
    innerHTML: string;
    rawTagName: string;
    attrEntries?: string[][];
}

interface PreprocessSinglePageOptions {
    root: string;
    path: string;
    tocDir: string;
    title?: string;
}

const HEADERS_SELECTOR = 'h1, h2, h3, h4, h5, h6';

function getNewNode(options: ModifyNode): HTMLElement | null {
    const {rawTagName, innerHTML, attrEntries} = options;

    const nodeNew = parse(`<html><${rawTagName}></${rawTagName}></html>`)
        .querySelector(`${rawTagName}`);

    if (!nodeNew) {
        return null;
    }

    if (attrEntries) {
        for (const [name, value] of attrEntries) {
            nodeNew.setAttribute(name, value);
        }
    }

    nodeNew.innerHTML = innerHTML;

    return nodeNew;
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


export function replaceLinks(rootEl: HTMLElement, options: PreprocessSinglePageOptions) {
    const {root, path, tocDir} = options;

    rootEl.querySelectorAll('a:not(.yfm-anchor):not([target="_blank"])').forEach((node) => {
        const href = node.getAttribute('href') || '';

        const resolvedPath = resolve(root, path);
        const linkFullPath = resolveRelativePath(resolvedPath, href);
        const isLinkOutOfToc = !linkFullPath.startsWith(tocDir);


        let preparedHref = href;

        if (isLinkOutOfToc) {
            preparedHref = relative(tocDir, linkFullPath);
        } else {
            const {pathname, hash} = url.parse(href);
            if (pathname) {
                preparedHref = getSinglePageAnchorId({
                    root,
                    currentPath: resolvedPath,
                    pathname,
                    hash,
                });
            } else if (hash) {
                preparedHref = getSinglePageAnchorId({root, currentPath: resolvedPath, hash});
            }
        }


        node.setAttribute('href', preparedHref);
    });
}

export function replaceImages(rootEl: HTMLElement, options: PreprocessSinglePageOptions) {
    const {root, path, tocDir} = options;

    rootEl.querySelectorAll('img').forEach((node) => {
        const href = node.getAttribute('src') || '';

        if (isExternalHref(href)) {
            return;
        }

        const resolvedPath = resolve(root, path);
        const linkFullPath = resolveRelativePath(resolvedPath, href);
        const preparedHref = relative(tocDir, linkFullPath);


        node.setAttribute('src', preparedHref);
    });
}


function prepareAnchorAttr(name: string, value: string, pageId: string) {
    switch (name) {
        case 'href':
            return `#${pageId}_${value.slice(1)}`;
        case 'id':
            return `${pageId}_${value}`;
        default:
            return value;
    }
}

function prepareAnchorAttrs(node: HTMLElement, pageId: string) {
    for (const [name, value] of Object.entries(node.attributes)) {
        const preparedValue = prepareAnchorAttr(name, value, pageId);

        node.setAttribute(name, preparedValue);
    }
}

export function addPagePrefixToAnchors(rootEl: HTMLElement, options: PreprocessSinglePageOptions) {
    const {root, path} = options;

    const resolvedPath = resolve(root, path);
    const pageIdAnchor = getSinglePageAnchorId({root, currentPath: resolvedPath});
    const originalArticleHref = transformLinkToOriginalArticle({root, currentPath: resolvedPath});
    const pageId = pageIdAnchor.slice(1);
    const anchorSelector = '.yfm-anchor';

    // Add the page prefix id to all existing anchors
    rootEl.querySelectorAll(anchorSelector).forEach((node) => {
        prepareAnchorAttrs(node, pageId);
    });

    const mainHeader = rootEl.querySelector('h1');
    if (mainHeader) {
        const anchor = parse(`<a class="yfm-anchor" aria-hidden="true" href="${pageIdAnchor}" id="${pageId}"></a>`);
        if (!anchor) {
            return;
        }

        mainHeader.setAttribute('data-original-article', `${originalArticleHref}.html`);
        mainHeader.appendChild(anchor);
    }

    rootEl.querySelectorAll(HEADERS_SELECTOR).forEach((node) => {
        prepareAnchorAttrs(node, pageId);
    });
}

export function addMainTitle(rootEl: HTMLElement, options: PreprocessSinglePageOptions) {
    const {title} = options;

    if (!title) {
        return;
    }

    const mainTitle = getNewNode({innerHTML: title, rawTagName: 'h1'});

    if (!mainTitle) {
        return;
    }

    rootEl.insertAdjacentHTML('afterbegin', mainTitle.toString());
}

export function getSinglePageAnchorId(args: {
    root: string;
    currentPath: string;
    pathname?: string;
    hash?: string | null;
}) {
    const {root, currentPath, pathname, hash} = args;
    let resultAnchor = currentPath;

    if (pathname) {
        resultAnchor = resolveRelativePath(currentPath, pathname);
    }

    resultAnchor = resultAnchor
        .replace(root, '')
        .replace(/\.(md|ya?ml|html)$/i, '')
        .replace(new RegExp(_.escapeRegExp(sep), 'gi'), '_');

    if (hash) {
        resultAnchor = resultAnchor + '_' + hash.slice(1);
    }

    return `#${resultAnchor}`;
}

export function transformLinkToOriginalArticle(opts: {root: string; currentPath: string}) {
    const {root, currentPath} = opts;

    return currentPath.replace(root, '').replace(/\.(md|ya?ml|html)$/i, '');
}

export function preprocessPageHtmlForSinglePage(content: string, options: PreprocessSinglePageOptions) {
    const root = parse(content);

    addMainTitle(root, options);
    tryFixFirstPageHeader(root);
    addPagePrefixToAnchors(root, options);
    decreaseHeadingLevels(root);
    replaceLinks(root, options);
    replaceImages(root, options);

    return root.toString();
}
