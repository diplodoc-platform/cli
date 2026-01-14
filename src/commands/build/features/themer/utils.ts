import type {Run} from '~/commands/build';

import {join} from 'node:path';
import {generateCSS, parseCSS, updateBaseColor} from '@gravity-ui/uikit-themer';
import {load as loadYaml} from 'js-yaml';
import chroma from 'chroma-js';

import {
    ALL_COLORS,
    APP_CSS_PREFIX,
    BASE_BRAND,
    RTL_CSS_SUFFIX,
    THEME_CONFIG_FILENAME,
    THEME_VARIANTS,
    UTILITY_COLORS,
    YFM_COLORS,
} from './constants';
import type {ThemeConfig, UtilityColorKey, YfmCssVars} from './types';

function checkColor(run: Run, value: string | undefined): string | null {
    if (!value) {
        return null;
    }

    if (!chroma.valid(value)) {
        run.logger.error(`Invalid color: ${value}`);
        return null;
    }

    return value;
}

export async function generateThemeCss(run: Run) {
    const themeConfigPath = join(run.originalInput, THEME_CONFIG_FILENAME);
    const baseBrandOverride = run.config.theme;

    const hasThemeConfig = run.exists(themeConfigPath);
    const shouldGenerate = Boolean(baseBrandOverride) || hasThemeConfig;

    if (!shouldGenerate) {
        return null;
    }

    const appCssFile = run.manifest.app.css.find(
        (file: string) => file.startsWith(APP_CSS_PREFIX) && !file.includes(RTL_CSS_SUFFIX),
    );

    if (!appCssFile) {
        run.logger.error('Failed to find app CSS file for theme generation');
        return null;
    }

    const cssPath = join(run.assetsPath, appCssFile);
    const cssForThemer = await run.read(cssPath);
    let theme = parseCSS(cssForThemer);

    const config: ThemeConfig = hasThemeConfig
        ? (loadYaml(await run.read(themeConfigPath)) as ThemeConfig) || {}
        : {};

    const yfmCssVars: YfmCssVars = {light: [], dark: []};

    ALL_COLORS.forEach((key) => {
        const color = {
            light: config.light?.[key] || config[key],
            dark: config.dark?.[key] || config[key],
        };

        if (key === BASE_BRAND) {
            if (baseBrandOverride) {
                color.light = baseBrandOverride;
                color.dark = baseBrandOverride;
            }

            THEME_VARIANTS.forEach((themeVariant) => {
                const value = color[themeVariant];

                if (value) {
                    theme = updateBaseColor({
                        theme,
                        colorToken: BASE_BRAND,
                        themeVariant,
                        value,
                    });
                }
            });
        } else if (UTILITY_COLORS.includes(key as UtilityColorKey)) {
            THEME_VARIANTS.forEach((themeVariant) => {
                const value = checkColor(run, color[themeVariant]);

                if (value) {
                    theme.utilityColors[key as UtilityColorKey][themeVariant] = {
                        value,
                    };
                }
            });
        } else if (YFM_COLORS.includes(key)) {
            THEME_VARIANTS.forEach((themeVariant) => {
                const value = checkColor(run, color[themeVariant]);

                if (value) {
                    yfmCssVars[themeVariant].push(`    --yfm-color-${key}: ${value};`);
                }
            });
        }
    });

    const css = generateCSS({theme}) as string;

    const yfmCss = THEME_VARIANTS.map((themeVariant) => {
        const cssLines = yfmCssVars[themeVariant].join('\n');
        return cssLines
            ? `.g-root_theme_${themeVariant} .dc-doc-page .yfm {\n${cssLines}\n}\n`
            : '';
    })
        .filter(Boolean)
        .join('\n');

    return yfmCss ? `${css}\n\n${yfmCss}\n` : css;
}
