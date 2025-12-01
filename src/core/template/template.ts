import type {Alternate} from '~/core/meta';

import {uniqBy} from 'lodash';
import {dedent} from 'ts-dedent';
import {getCSP} from 'csp-header';

import {bounded, get, getDepth, getDepthPath, normalizePath} from '~/core/utils';

import {getFaviconType} from './utils';

enum ScriptPosition {
    Leading = 'leading',
    State = 'state',
    Trailing = 'trailing',
}

enum StylePosition {
    Leading = 'leading',
    Trailing = 'trailing',
}

type PositionInfo = {
    position: `${StylePosition}` | `${ScriptPosition}`;
};

type StyleInfo = PositionInfo & {
    value: string;
    inline: boolean;
    attrs: Hash<string | undefined>;
};

type ScriptInfo = PositionInfo & {
    value: string;
    inline: boolean;
    attrs: Hash<string | undefined>;
};

const RTL_LANGS = [
    'ar',
    'arc',
    'ckb',
    'dv',
    'fa',
    'ha',
    'he',
    'khw',
    'ks',
    'ps',
    'sd',
    'ur',
    'uz_AF',
    'yi',
];

/**
 * Template builder for creating HTML pages programmatically.
 *
 * Supports flexible composition of HTML documents with metadata, styles, scripts,
 * CSP headers, and other elements. Uses builder pattern with method chaining.
 *
 * @example
 * ```typescript
 * const template = new Template('/docs/index.html', 'en');
 * template
 *     .setTitle('My Documentation')
 *     .addStyle('/assets/styles.css')
 *     .addBody('<div>Content</div>');
 * const html = template.dump();
 * ```
 */
export class Template {
    /** Whether the template's language is right-to-left (RTL) */
    get isRTL() {
        return RTL_LANGS.includes(this.lang);
    }

    /** Normalized path of the page (used for calculating base href) */
    readonly path: NormalizedPath;

    /** Language code for the page (e.g., 'en', 'ru', 'ar') */
    readonly lang: string;

    private signs: symbol[] = [];

    private title = '';

    private csp: Hash<string[]> = {};

    private meta: Hash[] = [];

    private styles: StyleInfo[] = [];

    private scripts: ScriptInfo[] = [];

    private body: string[] = [];

    private bodyClass: string[] = ['g-root', 'g-root_theme_light'];

    private faviconSrc = '';

    private canonical = '';

    private alternates: Alternate[] = [];

    /**
     * Creates a new Template instance.
     *
     * @param path - Relative path of the page (will be normalized)
     * @param lang - Language code for the page
     * @param signs - Optional array of symbols for template identification/classification
     */
    constructor(path: RelativePath, lang: string, signs: symbol[] = []) {
        this.path = normalizePath(path);
        this.lang = lang;
        this.signs = signs;
    }

    /**
     * Checks if the template has a specific sign.
     *
     * @param sign - Symbol to check
     * @returns `true` if template has the sign
     */
    is(sign: symbol) {
        return this.signs.includes(sign);
    }

    /**
     * Escapes HTML entities in a string.
     *
     * @param string - String to escape
     * @returns Escaped string with HTML entities
     */
    escape(string: string) {
        return string.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /**
     * Unescapes HTML entities in a string.
     *
     * IMPORTANT: This method should be serializable.
     *
     * @param string - String with HTML entities
     * @returns Unescaped string
     */
    unescape(string: string) {
        // IMPORTANT: This method should be serializable
        return string.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    }

    /**
     * Sets the page title (overwrites previous value).
     *
     * @param title - Page title text
     * @returns Template instance for method chaining
     */
    @bounded setTitle(title: string) {
        this.title = title;

        return this;
    }

    /**
     * Adds a meta tag (can be called multiple times).
     *
     * @param props - Hash of meta tag attributes (e.g., `{name: 'description', content: '...'}`)
     * @returns Template instance for method chaining
     */
    @bounded addMeta(props: Hash) {
        this.meta.push(props);

        return this;
    }

    /**
     * Adds a CSS style (can be called multiple times).
     *
     * @param style - CSS file path or inline CSS content
     * @param options - Style options (position, inline, attrs) or legacy number parameter
     * @param options.position - Position in HTML: 'leading' (in head) or 'trailing' (end of body). Default: 'leading'
     * @param options.inline - Whether style is inline. Default: false
     * @param options.attrs - Additional HTML attributes
     * @returns Template instance for method chaining
     */
    @bounded addStyle(style: string, options: Partial<StyleInfo> | number = {}) {
        if (typeof options === 'number') {
            options = {};
        }

        options = {
            position: StylePosition.Leading,
            inline: false,
            attrs: {},
            ...options,
        };

        this.styles.push({
            ...(options as StyleInfo),
            value: style,
        });

        return this;
    }

    /**
     * Adds a JavaScript script (can be called multiple times).
     *
     * @param script - JS file path or inline JS content
     * @param options - Script options (position, inline, attrs) or legacy number parameter
     * @param options.position - Position in HTML: 'leading' (in head), 'state' (after body opening), or 'trailing' (end of body). Default: 'trailing'
     * @param options.inline - Whether script is inline. Default: false
     * @param options.attrs - Additional HTML attributes
     * @returns Template instance for method chaining
     */
    @bounded addScript(script: string, options: Partial<ScriptInfo> | number = {}) {
        if (typeof options === 'number') {
            options = {};
        }

        options = {
            position: StylePosition.Trailing,
            inline: false,
            attrs: {},
            ...options,
        };

        this.scripts.push({
            ...(options as ScriptInfo),
            value: script,
        });

        return this;
    }

    /**
     * Adds content to the body (can be called multiple times, content is concatenated).
     *
     * @param body - HTML body content
     * @returns Template instance for method chaining
     */
    @bounded addBody(body: string) {
        this.body.push(body);

        return this;
    }

    /**
     * Adds CSS classes to the body tag (can be called multiple times).
     *
     * @param classes - CSS class names to add
     * @returns Template instance for method chaining
     */
    @bounded addBodyClass(...classes: string[]) {
        this.bodyClass.push(...classes);

        return this;
    }

    /**
     * Merges CSP (Content Security Policy) directives (can be called multiple times).
     *
     * @param rules - CSP directives hash (e.g., `{'script-src': ["'self'", "'nonce-abc'"]}`)
     * @returns Template instance for method chaining
     */
    @bounded addCsp(rules: Hash<string[]>) {
        for (const [key, records] of Object.entries(rules)) {
            this.csp[key] = this.csp[key] || [];
            this.csp[key].push(...records);
        }
    }

    /**
     * Sets the favicon source URL (overwrites previous value).
     *
     * @param faviconSrc - Favicon file path or URL
     * @returns Template instance for method chaining
     */
    @bounded setFaviconSrc(faviconSrc: string) {
        this.faviconSrc = faviconSrc;

        return this;
    }

    /**
     * Sets the canonical URL (overwrites previous value).
     *
     * @param canonical - Canonical link URL
     * @returns Template instance for method chaining
     */
    @bounded setCanonical(canonical: string) {
        this.canonical = canonical;

        return this;
    }

    /**
     * Adds alternate language links (can be called multiple times, duplicates are removed).
     *
     * @param alternates - Array of alternate link objects with href and hreflang
     * @returns Template instance for method chaining
     */
    @bounded addAlternates(alternates: Alternate[]) {
        this.alternates = uniqBy(this.alternates.concat(alternates), get('href'));

        return this;
    }

    /**
     * Generates the final HTML string from the template.
     *
     * Calculates base href, formats all metadata, styles, scripts, and body content
     * into a complete HTML document. Automatically handles RTL languages and CSP nonces.
     *
     * @returns Complete HTML document as string
     */
    dump() {
        const {lang, title, styles, scripts, body, bodyClass, faviconSrc, canonical, alternates} =
            this;
        const base = getDepthPath(getDepth(this.path) - 1);
        const faviconType = getFaviconType(faviconSrc);

        return dedent`
            <!DOCTYPE html>
            <html lang="${lang}" dir="${this.isRTL ? 'rtl' : 'ltr'}">
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <base href="${base}" />
                    <title>${title}</title>
                    ${canonical ? `<link rel="canonical" href="${canonical}">` : ''}
                    ${Object.values(alternates)
                        .sort((a, b) => a.href.localeCompare(b.href))
                        .map(alternate)
                        .join('\n')}
                    ${this.meta.map(meta).join('\n')}
                    ${csp(this.csp)}
                    <style type="text/css">html, body {min-height:100vh; height:100vh;}</style>
                    ${faviconSrc && `<link rel="icon" type="${faviconType}" href="${faviconSrc}">`}
                    ${leading(scripts).map(script(this.csp)).join('\n')}
                    ${leading(styles).map(style(this.csp)).join('\n')}
                </head>
                <body class="${bodyClass.join(' ')}">
                    ${body.join('\n') || `<div id="root"></div>`}
                    ${state(scripts).map(script(this.csp)).join('\n')}
                    ${trailing(scripts).map(script(this.csp)).join('\n')}
                    ${trailing(styles).map(style(this.csp)).join('\n')}
                </body>
            </html>
        `;
    }
}

function leading<T extends PositionInfo>(array: T[]) {
    return array.filter(({position}) => position === 'leading');
}

function state<T extends PositionInfo>(array: T[]) {
    return array.filter(({position}) => position === 'state');
}

function trailing<T extends PositionInfo>(array: T[]) {
    return array.filter(({position}) => position === 'trailing');
}

function meta(record: Hash<string>) {
    return `<meta ${attributes(record)}>`;
}

function alternate({href, hreflang}: Alternate) {
    return `<link ${attributes({rel: 'alternate', href, hreflang})} />`;
}

function csp(directives: Hash<string[]> | undefined) {
    if (!directives || !Object.keys(directives).length) {
        return '';
    }

    return meta({
        'http-equiv': 'Content-Security-Policy',
        content: getCSP({directives}),
    });
}

function style(csp: Hash<string[]> | undefined) {
    return function ({value, inline, attrs}: StyleInfo) {
        if (inline) {
            return dedent`
                <style ${attributes({...attrs, nonce: nonce(csp, 'style-src')})}>
                    ${value}
                </style>
            `;
        }

        return `<link ${attributes({
            ...attrs,
            type: 'text/css',
            rel: 'stylesheet',
            href: value,
            nonce: nonce(csp, 'style-src'),
        })}/>`;
    };
}

function script(csp: Hash<string[]> | undefined) {
    return function ({value, inline, attrs}: StyleInfo) {
        if (inline) {
            return dedent`
                <script ${attributes({
                    type: 'application/javascript',
                    ...attrs,
                    nonce: nonce(csp, 'script-src'),
                })}>
                    ${value}
                </script>
            `;
        }

        return `<script ${attributes({
            type: 'application/javascript',
            defer: '',
            ...attrs,
            src: value,
            nonce: nonce(csp, 'script-src'),
        })}></script>`;
    };
}

function nonce(csp: Hash<string[]> | undefined, scope: string): string | undefined {
    if (!csp || !csp[scope]) {
        return;
    }

    const rule = csp[scope].find((rule) => rule.match(/^nonce/));

    if (!rule) {
        return;
    }

    return (rule.match(/(?<=nonce=).*/g) as string[])[0];
}

function attributes(attrs: Hash<string | undefined>) {
    return Object.keys(attrs)
        .reduce((acc, key) => {
            const value = attrs[key];

            if (value === '') {
                acc += ` ${key}`;
            } else if (value !== undefined) {
                acc += ` ${key}="${value}"`;
            }

            return acc;
        }, '')
        .trim();
}
