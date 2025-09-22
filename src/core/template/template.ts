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

export class Template {
    get isRTL() {
        return RTL_LANGS.includes(this.lang);
    }

    readonly path: NormalizedPath;

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

    constructor(path: RelativePath, lang: string, signs: symbol[] = []) {
        this.path = normalizePath(path);
        this.lang = lang;
        this.signs = signs;
    }

    is(sign: symbol) {
        return this.signs.includes(sign);
    }

    escape(string: string) {
        return string.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    unescape(string: string) {
        // IMPORTANT: This method should be serializable
        return string.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    }

    @bounded setTitle(title: string) {
        this.title = title;

        return this;
    }

    @bounded addMeta(props: Hash) {
        this.meta.push(props);

        return this;
    }

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

    @bounded addBody(body: string) {
        this.body.push(body);

        return this;
    }

    @bounded addBodyClass(...classes: string[]) {
        this.bodyClass.push(...classes);

        return this;
    }

    @bounded addCsp(rules: Hash<string[]>) {
        for (const [key, records] of Object.entries(rules)) {
            this.csp[key] = this.csp[key] || [];
            this.csp[key].push(...records);
        }
    }

    @bounded setFaviconSrc(faviconSrc: string) {
        this.faviconSrc = faviconSrc;

        return this;
    }

    @bounded setCanonical(canonical: string) {
        this.canonical = canonical;

        return this;
    }

    @bounded addAlternates(alternates: Alternate[]) {
        this.alternates = uniqBy(this.alternates.concat(alternates), get('href'));

        return this;
    }

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
                    ${Object.values(alternates).map(alternate).join('\n')}
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
