import type MarkdownIt from 'markdown-it';

import Token from 'markdown-it/lib/token';
import {LogLevels, normalizeConfig, yfmlint} from '@diplodoc/yfmlint';

const ANCHOR_RULE = 'YFM024';
const ANCHOR_ALIAS = 'missing-local-anchor';

/**
 * Reports CLI anchor diagnostics independently of the legacy YFM002 rule.
 * yfmlint 1.10.0 cannot accept custom rules, so reuse its link rule on a copy of
 * the parsed tokens. This preserves include contexts and inline suppression
 * without parsing the document or running transform plugins a second time.
 */
export async function lintWithLocalAnchors(
    content: string,
    path: string,
    options: Parameters<typeof yfmlint>[2],
) {
    const ruleConfig = normalizeConfig({
        [ANCHOR_RULE]:
            options.lintConfig?.[ANCHOR_RULE] ??
            options.lintConfig?.[ANCHOR_ALIAS] ??
            LogLevels.WARN,
    })[ANCHOR_RULE];

    if (ruleConfig === false) {
        return yfmlint(content, path, options);
    }

    let tokens: Token[] | undefined;
    const captureTokens = (md: MarkdownIt) => {
        const parse = md.parse.bind(md);
        md.parse = (markdown, env) => {
            tokens = parse(markdown, env);
            return tokens;
        };
    };
    const plugins = [...(options.plugins || []), captureTokens];
    const errors = await yfmlint(content, path, {...options, plugins});

    // markdownlint skips parsing when every existing rule is disabled.
    // The CLI anchor rule must still work in that configuration.
    if (!tokens) {
        await yfmlint(remapAnchorDirectives(content), path, {
            ...options,
            plugins,
            lintConfig: {default: false, YFM002: ruleConfig},
        });
    }

    const anchorTokens = (tokens || []).filter(
        (token) =>
            token.type === 'inline' && token.children?.some((child) => child.attrGet(ANCHOR_RULE)),
    );

    if (!anchorTokens.length) {
        return errors;
    }

    const anchorErrors = await yfmlint(remapAnchorDirectives(content), path, {
        ...options,
        lintConfig: {default: false, YFM002: ruleConfig},
        plugins: [
            (md: MarkdownIt) => {
                md.parse = () => copyAnchorTokens(anchorTokens);
            },
        ],
    });

    const diagnostics = (anchorErrors || [])
        .filter((error) => error.ruleNames.includes('YFM002'))
        .map((error) => {
            error.ruleNames = [ANCHOR_RULE, ANCHOR_ALIAS];
            error.ruleDescription = 'Local link anchor is missing in the target document';
            return error;
        });

    return [...(errors || []), ...diagnostics];
}

function copyAnchorTokens(tokens: Token[]): Token[] {
    return tokens.map((token) => {
        const copy = Object.assign(new Token(token.type, token.tag, token.nesting), token);
        copy.attrs =
            token.attrs
                ?.filter(([name]) => name !== 'YFM002')
                .map(([name, value]) => [name === ANCHOR_RULE ? 'YFM002' : name, value]) || null;
        copy.children = token.children ? copyAnchorTokens(token.children) : null;
        copy.map = token.map ? [...token.map] : null;
        return copy;
    });
}

function remapAnchorDirectives(content: string) {
    return content
        .split('<!--')
        .map((part, index) => {
            const end = part.indexOf('-->');
            if (index === 0 || end < 0 || !/^\s*markdownlint-/i.test(part)) {
                return part;
            }

            const directive = part
                .slice(0, end)
                .replace(/\b(YFM002|no-header-found-for-link)\b/gi, 'legacy-$1')
                .replace(/\b(YFM024|missing-local-anchor)\b/gi, 'YFM002');
            return directive + part.slice(end);
        })
        .join('<!--');
}
