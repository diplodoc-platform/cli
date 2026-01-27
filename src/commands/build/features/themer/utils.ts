import type {Run} from '~/commands/build';
import type {ColorVariant, ThemeConfig, UtilityColorKey, CssVars} from './types';

import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import Ajv from 'ajv';
import {type GravityTheme, generateCSS, parseCSS, updateBaseColor} from '@gravity-ui/uikit-themer';
import {load as loadYaml} from 'js-yaml';
import chroma from 'chroma-js';

import {
    ALL_COLORS,
    APP_CSS_PREFIX,
    BASE_BRAND,
    DC_COLORS,
    ROOT,
    RTL_CSS_SUFFIX,
    THEME_CONFIG_FILENAME,
    THEME_VARIANTS,
    UTILITY_COLORS,
    YFM_COLORS,
} from './constants';

function checkColor(run: Run, value: string | undefined): string | null {
    if (value === undefined) {
        return null;
    }

    if (typeof value !== 'string' || !chroma.valid(value) || value === '') {
        run.logger.error(`Invalid color: "${value}"`);
        return null;
    }

    return value;
}

function handleThemeVariants(
    run: Run,
    color: {light?: string; dark?: string},
    callback: (themeVariant: ColorVariant, value: string) => void,
) {
    THEME_VARIANTS.forEach((themeVariant) => {
        const value = checkColor(run, color[themeVariant]);
        if (value) {
            callback(themeVariant, value);
        }
    });
}

async function loadThemeConfig(run: Run): Promise<ThemeConfig> {
    const themeConfigPath = join(run.originalInput, THEME_CONFIG_FILENAME);

    if (!run.exists(themeConfigPath)) {
        return {};
    }

    return (loadYaml(await run.read(themeConfigPath)) as ThemeConfig) || {};
}

async function loadBaseCss(run: Run) {
    const appCssFile = run.manifest.app.css.find(
        (file: string) => file.startsWith(APP_CSS_PREFIX) && !file.includes(RTL_CSS_SUFFIX),
    );

    if (!appCssFile) {
        run.logger.error('Failed to find app CSS file for theme generation');
        return null;
    }

    const cssPath = join(run.assetsPath, appCssFile);
    const baseCss = await run.read(cssPath);

    return parseCSS(baseCss);
}

function generateAdditionalCss(cssVars: CssVars, prefix = ''): string {
    return THEME_VARIANTS.map((themeVariant) => {
        const cssLines = cssVars[themeVariant].join('\n');
        return cssLines
            ? `.g-root_theme_${themeVariant} .dc-doc-page ${prefix}{\n${cssLines}\n}\n`
            : '';
    })
        .filter(Boolean)
        .join('\n');
}

function joinCss(...cssParts: string[]): string {
    return cssParts.filter(Boolean).join('\n\n');
}

function processColors(
    run: Run,
    theme: GravityTheme,
    config: ThemeConfig,
    themeFlagValue: string | null | undefined,
): {theme: GravityTheme; yfmCssVars: CssVars; dcCssVars: CssVars} {
    let result = theme;
    const yfmCssVars: CssVars = {light: [], dark: []};
    const dcCssVars: CssVars = {light: [], dark: []};

    ALL_COLORS.forEach((key) => {
        const color = {
            light: config.light?.[key] ?? config[key],
            dark: config.dark?.[key] ?? config[key],
        };

        if (key === BASE_BRAND) {
            if (themeFlagValue) {
                color.light = themeFlagValue;
                color.dark = themeFlagValue;
            }

            handleThemeVariants(run, color, (themeVariant, value) => {
                result = updateBaseColor({
                    theme: result,
                    colorToken: BASE_BRAND,
                    themeVariant,
                    value,
                });
            });
        } else if (UTILITY_COLORS.includes(key as UtilityColorKey)) {
            handleThemeVariants(run, color, (themeVariant, value) => {
                result.utilityColors[key as UtilityColorKey][themeVariant] = {
                    value,
                };
            });
        } else if (YFM_COLORS.includes(key)) {
            handleThemeVariants(run, color, (themeVariant, value) => {
                yfmCssVars[themeVariant].push(`    --yfm-color-${key}: ${value};`);
            });
        } else if (DC_COLORS.includes(key)) {
            handleThemeVariants(run, color, (themeVariant, value) => {
                dcCssVars[themeVariant].push(`    --dc-color-${key}: ${value};`);
            });
        }
    });

    return {theme: result, yfmCssVars, dcCssVars};
}

async function validateConfig(run: Run, config: ThemeConfig): Promise<void> {
    if (!Object.keys(config).length) {
        return;
    }

    const schemaPath = join(ROOT, 'schemas/theme-schema.yaml');
    const schema = loadYaml(await readFile(schemaPath, 'utf8')) as object;

    const ajv = new Ajv({allErrors: true});
    const isValid = ajv.validate(schema, config);

    if (!isValid) {
        ajv.errors?.forEach((err) => {
            const path = err.instancePath;
            const fileContext = `File ${THEME_CONFIG_FILENAME}`;
            const property = err.params?.additionalProperty;
            const message = `${path || fileContext} ${err.message}${property ? ` "${property}"` : ''}`;
            if (property) {
                run.logger.warn(message);
            } else {
                run.logger.error(message);
            }
        });
    }
}

export async function generateThemeCss(run: Run) {
    const themeFlagValue = run.config.theme;
    const config = await loadThemeConfig(run);

    const shouldGenerate = Boolean(themeFlagValue) || Object.keys(config).length;
    if (!shouldGenerate) {
        return null;
    }

    await validateConfig(run, config);

    const baseTheme = await loadBaseCss(run);
    if (!baseTheme) {
        return null;
    }

    const {theme, yfmCssVars, dcCssVars} = processColors(run, baseTheme, config, themeFlagValue);

    const themeCss = generateCSS({theme}) as string;
    const yfmCss = generateAdditionalCss(yfmCssVars, '.yfm ');
    const dcCss = generateAdditionalCss(dcCssVars);

    return joinCss(themeCss, yfmCss, dcCss);
}
