import type {Run} from '~/commands/build';
import type {CodeHighlightConfig, ColorVariant, ThemeColors, ThemeConfig} from './types';

import {join} from 'node:path';
import postcss from 'postcss';

import {THEME_VARIANTS} from './constants';

const BUILT_IN_CODE_HIGHLIGHT = 'diplodoc';
const CODE_HIGHLIGHT_THEME_RE = /^[a-z0-9][a-z0-9/_-]*$/i;

const YFM_CODE_COLOR_OVERRIDES = {
    code: 'color',
    'code-background': 'background',
} as const;

function hasCodeHighlight(
    config: CodeHighlightConfig | null | undefined,
): config is CodeHighlightConfig {
    return Boolean(config?.light || config?.dark);
}

function getThemeScope(themeVariant: ColorVariant): string {
    return `.g-root_theme_${themeVariant} .dc-doc-page .yfm`;
}

function getCodeHighlightPath(run: Run, themeName: string): AbsolutePath | null {
    if (themeName === BUILT_IN_CODE_HIGHLIGHT) {
        return null;
    }

    if (!CODE_HIGHLIGHT_THEME_RE.test(themeName)) {
        throw new Error(`Invalid code highlight theme name: "${themeName}"`);
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
        const parent = rule.parent;

        // Fix pass @keyframes
        if (parent?.type === 'atrule' && /keyframes$/i.test((parent as postcss.AtRule).name)) {
            return;
        }

        if (rule.selectors?.length) {
            rule.selectors = rule.selectors.map((selector) => `${scope} ${selector}`);
        }
    });

    return root.toString();
}

async function generateThemeCss(
    run: Run,
    themeVariant: ColorVariant,
    themeName: string,
): Promise<string> {
    const themePath = getCodeHighlightPath(run, themeName);

    if (!themePath) {
        return '';
    }

    const css = await run.read(themePath);

    return scopeCss(css, getThemeScope(themeVariant));
}

function generateThemeOverridesCss(config: ThemeConfig, themeVariant: ColorVariant): string {
    const variantConfig = config[themeVariant] as ThemeColors | undefined;

    const declarations = Object.entries(YFM_CODE_COLOR_OVERRIDES)
        .map(([colorKey, cssProperty]) => {
            const hasColor = variantConfig?.[colorKey] ?? config[colorKey];

            if (!hasColor) {
                return '';
            }

            return `    ${cssProperty}: var(--yfm-color-${colorKey});`;
        })
        .filter(Boolean);

    if (!declarations.length) {
        return '';
    }

    return `${getThemeScope(themeVariant)} .hljs {\n${declarations.join('\n')}\n}`;
}

function generateOverridesCss(config: ThemeConfig): string {
    return THEME_VARIANTS.map((themeVariant) => generateThemeOverridesCss(config, themeVariant))
        .filter(Boolean)
        .join('\n\n');
}

export async function generateCodeHighlightCss(
    run: Run,
    themeConfig: ThemeConfig,
): Promise<string> {
    const codeHighlight = run.config.codeHighlight;

    if (!hasCodeHighlight(codeHighlight)) {
        return '';
    }

    const themeCssParts = await Promise.all(
        THEME_VARIANTS.map((themeVariant) => {
            const themeName = codeHighlight[themeVariant];

            return themeName ? generateThemeCss(run, themeVariant, themeName) : '';
        }),
    );

    return [...themeCssParts, generateOverridesCss(themeConfig)].filter(Boolean).join('\n\n');
}
