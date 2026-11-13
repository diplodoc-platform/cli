import type Token from 'markdown-it/lib/token';

import {basename} from 'node:path';

import {isExternalHref, normalizePath, setExt} from '~/core/utils';

/** Checks visible links using the shared page index, without reading target documents. */
export function findAgentPageLinks(
    tokens: Token[],
    audience: (path: NormalizedPath) => 'agent' | 'common' | undefined,
): Set<NormalizedPath> {
    const targets = new Set<NormalizedPath>();
    const visit = (token: Token) => {
        const href = token.type === 'link_open' ? token.attrGet('href') : null;
        if (href && !isExternalHref(href) && !href.startsWith('#') && !href.startsWith('*')) {
            const path = href.split(/[?#]/)[0];
            if (basename(path).includes('.') && !/\.(?:md|html|ya?ml)$/i.test(path)) {
                return;
            }
            // The transform link plugin has already resolved hrefs from the project root.
            const target = normalizePath(path.replace(/^\//, ''));
            const stem = target.replace(/\.(?:md|html|ya?ml)$/i, '');
            for (const candidate of [
                setExt(target, '.md'),
                setExt(target, '.yaml'),
                `${stem}/index.md`,
                `${stem}/index.yaml`,
            ]) {
                const normalized = normalizePath(candidate);
                if (audience(normalized) === 'agent') {
                    targets.add(normalized);
                }
            }
        }
        token.children?.forEach(visit);
    };
    tokens.forEach(visit);
    return targets;
}
