import type {Run} from '~/commands/build';
import type {ColorVariant, CodeHighlightThemeConfig, ThemeColors, ThemeConfig} from './types';

import postcss from 'postcss';
import {join} from 'node:path';

import {THEME_VARIANTS} from './constants';

const BUILT_IN_CODE_HIGHLIGHT_THEME = 'diplodoc';
const CODE_HIGHLIGHT_THEME_RE = /^[a-z0-9][a-z0-9/_-]*$/i;

const OVERRIDABLE_YFM_CODE_COLORS = {
    code: 'color',
    'code-background': 'background',
} as const;

function hasSyntaxHighlightConfig(config: CodeHighlightThemeConfig | null | undefined): boolean {
    return Boolean(config?.light || config?.dark);
}

function resolveCodeHighlightThemePath(run: Run, themeName: string): AbsolutePath | null {
    if (themeName === BUILT_IN_CODE_HIGHLIGHT_THEME) {
        return null;
    }

    if (!CODE_HIGHLIGHT_THEME_RE.test(themeName)) {
        throw new Error(`Invalid syntax highlight theme name: "${themeName}"`);
    }

    const themePath = join(run.highlightStylesPath, `${themeName}.css`) as AbsolutePath;

    if (!run.exists(themePath)) {
        throw new Error(`Unknown highlight.js theme: "${themeName}"`);
    }

    return themePath;
}

function scopeCss(css: string, scope: string): string {
    const root = postcss.parse(css);

    root.walkRules((rule) => {
        if (!rule.selectors?.length) {
            return;
        }

        rule.selectors = rule.selectors.map((selector) => `${scope} ${selector}`);
    });

    return root.toString();
}

async function generateCodeHighlightThemeCssPart(
    run: Run,
    themeVariant: ColorVariant,
    themeName: string,
): Promise<string> {
    const themePath = resolveCodeHighlightThemePath(run, themeName);

    if (!themePath) {
        return '';
    }

    const css = await run.read(themePath);
    const scope = `.g-root_theme_${themeVariant} .dc-doc-page .yfm`;

    return scopeCss(css, scope);
}

function getThemeColor(
    config: ThemeConfig,
    themeVariant: ColorVariant,
    key: string,
): string | undefined {
    const variantConfig = config[themeVariant] as ThemeColors | undefined;

    return variantConfig?.[key] ?? config[key];
}

function generateCodeHighlightOverridesCss(config: ThemeConfig): string {
    return THEME_VARIANTS.map((themeVariant) => {
        const lines = Object.entries(OVERRIDABLE_YFM_CODE_COLORS)
            .map(([colorKey, cssProperty]) => {
                const value = getThemeColor(config, themeVariant, colorKey);

                if (!value) {
                    return '';
                }

                return `    ${cssProperty}: var(--yfm-color-${colorKey});`;
            })
            .filter(Boolean);

        if (!lines.length) {
            return '';
        }

        return `.g-root_theme_${themeVariant} .dc-doc-page .yfm .hljs {\n${lines.join('\n')}\n}`;
    })
        .filter(Boolean)
        .join('\n\n');
}

export async function generateCodeHighlightThemeCss(
    run: Run,
    themeConfig: ThemeConfig,
): Promise<string> {
    const syntaxHighlight = run.config.syntaxHighlight;

    if (!hasSyntaxHighlightConfig(syntaxHighlight)) {
        return '';
    }

    const themeCssParts = await Promise.all(
        THEME_VARIANTS.map((themeVariant) => {
            const themeName = syntaxHighlight?.[themeVariant];

            if (!themeName) {
                return '';
            }

            return generateCodeHighlightThemeCssPart(run, themeVariant, themeName);
        }),
    );

    const themeYamlOverridesCss = generateCodeHighlightOverridesCss(themeConfig);

    return [...themeCssParts, themeYamlOverridesCss].filter(Boolean).join('\n\n');
}
