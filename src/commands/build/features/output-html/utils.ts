import type {Plugin} from '~/core/markdown';
import type {StateCore, Token} from '~/core/markdown/parser';

import {parseHref} from '@diplodoc/utils';
import {createNotesPlugin} from '@diplodoc/notes-extension/plugin';
import {bold} from 'chalk';
import anchors from '@diplodoc/transform/plugins/anchors';
import code from '@diplodoc/transform/plugins/code';
import {transform as createCut} from '@diplodoc/cut-extension';
import deflist from '@diplodoc/transform/plugins/deflist';
import images from '@diplodoc/transform/plugins/images';
import imsize from '@diplodoc/transform/plugins/imsize';
import sup from '@diplodoc/transform/plugins/sup';
import {transform as createTabs} from '@diplodoc/tabs-extension';
import video from '@diplodoc/transform/plugins/video';
import monospace from '@diplodoc/transform/plugins/monospace';
import table from '@diplodoc/transform/plugins/table';
import term from '@diplodoc/transform/plugins/term';
import blockAnchor from '@diplodoc/transform/plugins/block-anchor';
import inlineCode from '@diplodoc/transform/plugins/inline-code';
import file from '@diplodoc/transform/plugins/file';
import visibility from '@diplodoc/transform/plugins/visibility';
import underline from '@diplodoc/transform/plugins/underline';
import subscript from '@diplodoc/transform/plugins/subscript';
import footnotes from '@diplodoc/transform/plugins/footnotes';
import taskList from '@diplodoc/transform/plugins/task-list';

import {filterTokens, getHrefTokenAttr} from '~/core/utils';

import {extensionPlugins} from '../../../../core/markdown/extension-plugins';

import includes from './plugins/includes';
import includesDetect from './plugins/includes-detect';
import links from './plugins/links';
import linksAutotitles from './plugins/links-autotitles';
import linksExternal from './plugins/links-external';

const notes = createNotesPlugin(bold, undefined, {directiveSyntax: 'enabled'});
const cut = createCut({bundle: false, directiveSyntax: 'enabled'});
const tabs = createTabs({
    bundle: false,
    directiveSyntax: 'enabled',
    features: {
        enabledVariants: {radio: true, regular: true, dropdown: true, accordion: true},
    },
});

/** Syntax rules that can contain links or change which links are visible. */
export function getPageLinkPlugins(): Plugin[] {
    return [
        deflist,
        includes,
        includesDetect,
        cut,
        notes,
        anchors,
        tabs,
        monospace,
        table,
        term,
        inlineCode,
        blockAnchor,
        visibility,
    ];
}

export function getBaseMdItPlugins(): Plugin[] {
    const extensions = extensionPlugins();
    return [
        deflist,
        includes,
        includesDetect,
        cut,
        links,
        linksAutotitles,
        linksExternal,
        images,
        notes,
        anchors,
        tabs,
        code,
        imsize,
        sup,
        video,
        monospace,
        table,
        term,
        inlineCode,
        file,
        extensions.openapi,
        extensions.mermaid,
        extensions.latex,
        extensions.pageConstructor,
        blockAnchor,
        extensions.color,
        extensions.noTranslate,
        visibility,
        underline,
        subscript,
        footnotes,
        taskList,
    ];
}

/**
 * Extension plugins (cut, tabs, file, etc.) add `_assets/{name}-extension.{js,css}`
 * to `env.meta` when they detect their patterns in content. In the CLI's bundled
 * environment these runtime files don't exist as separate assets — they're part of
 * the app bundle. With merge-includes, inlined content makes these patterns visible
 * to the main page transform, producing extra <link>/<script> tags that 404.
 *
 * Without merge-includes the issue was masked: the includes plugin spreads `env`,
 * so meta mutations from nested `md.parse` calls were silently lost.
 */
const BUNDLED_EXTENSION_ASSET_RE = /^_assets\/[\w-]+-extension\.(js|css)$/;

export function filterBundledExtensionAssets(meta: {script?: string[]; style?: string[]}) {
    if (!meta) {
        return meta;
    }
    return {
        ...meta,
        script: meta.script?.filter((s) => !BUNDLED_EXTENSION_ASSET_RE.test(s)),
        style: meta.style?.filter((s) => !BUNDLED_EXTENSION_ASSET_RE.test(s)),
    };
}

// TODO(major): Deprecate
export function getCustomMdItPlugins() {
    try {
        const customPlugins = require(require.resolve('./plugins'));
        return Array.isArray(customPlugins) ? customPlugins : [];
    } catch {
        return [];
    }
}

/**
 * Normalizes an anchor to a canonical form for comparison.
 *
 * A link hash comes from the source (`#foo`, possibly percent-encoded, e.g.
 * `#%D1%80` for `#р`), while anchor ids in the index are collected from
 * rendered tokens (already decoded slugs). To compare them reliably we strip
 * the leading `#` and fully percent-decode both sides through the same helper.
 *
 * `decodeURIComponent` is used (not `decodeURI`) so that reserved characters
 * are decoded too; malformed sequences fall back to the raw value.
 *
 * @param value - Raw hash (`#anchor`) or a bare anchor/id.
 * @returns The decoded anchor, or `null` for empty/hash-only input.
 */
export function decodeAnchor(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    const anchor = value.startsWith('#') ? value.slice(1) : value;
    if (!anchor) {
        return null;
    }

    try {
        return decodeURIComponent(anchor);
    } catch {
        return anchor;
    }
}

type LinkWalker = (link: Token, href: string, tokens: Token[], index: number) => void;

export function walkLinks(state: StateCore, handler: LinkWalker) {
    filterTokens(state.tokens, 'inline', (inline) => {
        const childrenTokens = inline.children || [];

        filterTokens(childrenTokens, 'link_open', (link, {index}) => {
            const tokenClass = String(link.attrGet('class') ?? '');
            const href = getHrefTokenAttr(link);
            const {pathname, hash} = parseHref(href);

            /*  Don't process anchor links */
            const isYfmAnchor = tokenClass ? tokenClass.includes('yfm-anchor') : false;

            if (isYfmAnchor || !(pathname || hash)) {
                return;
            }

            handler(link, href, childrenTokens, index);
        });
    });
}
