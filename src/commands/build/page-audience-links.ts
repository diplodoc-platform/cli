import type {PageAudience} from '~/core/toc';
import type Token from 'markdown-it/lib/token';

import {dirname, extname, join} from 'node:path';

import {getHrefTokenAttr, isExternalHref, normalizePath} from '~/core/utils';

type AudienceLookup = (path: NormalizedPath) => PageAudience | undefined;

/** Checks visible links using the shared page index, without reading target documents. */
export function findAgentPageLinks(
    tokens: Token[],
    audience: AudienceLookup,
    source?: NormalizedPath,
): Set<NormalizedPath> {
    const targets = new Set<NormalizedPath>();
    const visit = (token: Token) => {
        if (token.type === 'link_open') {
            // HTML links are already relative to the project root. Markdown links retain
            // their author's location, including links emitted by nested includes.
            const from = source && (token.meta?.sourceFile ?? source);
            const href = source ? getHrefTokenAttr(token) : token.attrGet('href');
            for (const target of findAgentPageTargets(href ?? '', audience, from)) {
                targets.add(target);
            }
        }
        token.children?.forEach(visit);
    };
    tokens.forEach(visit);
    return targets;
}

/** Checks the indexed audience of a document link, relative to its source if supplied. */
export function findAgentPageTargets(
    href: string,
    audience: AudienceLookup,
    from?: NormalizedPath,
): NormalizedPath[] {
    const target = resolvePageTarget(href, audience, from);
    return target && audience(target) === 'agent' ? [target] : [];
}

/** Selects the actual document before checking its audience, using only the page index. */
export function resolvePageTarget(
    href: string,
    audience: AudienceLookup,
    from?: NormalizedPath,
): NormalizedPath | undefined {
    if (isExternalHref(href) || /^[#*{]/.test(href)) {
        return undefined;
    }
    const path = href.split(/[?#]/)[0];
    const directory = path.endsWith('/');
    const extension = directory ? '' : extname(path).toLowerCase();
    if (!path || (extension && !['.md', '.html', '.yaml', '.yml'].includes(extension))) {
        return undefined;
    }

    const target = normalizePath(
        from && !path.startsWith('/') ? join(dirname(from), path) : path.replace(/^\//, ''),
    );
    const stem = target.replace(/\.(?:md|html|ya?ml)$/i, '');
    let candidates: string[];
    if (extension && extension !== '.html') {
        candidates = [target];
    } else {
        const documents = ['.md', '.yaml', '.yml'].map((suffix) => stem + suffix);
        const indexes = ['.md', '.yaml', '.yml'].map((suffix) => `${target}/index${suffix}`);
        if (extension === '.html') {
            candidates = documents;
        } else if (directory) {
            candidates = indexes;
        } else {
            candidates = [...documents, ...indexes];
        }
    }

    return candidates.map(normalizePath).find((candidate) => audience(candidate) !== undefined);
}
