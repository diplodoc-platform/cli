import {resolve} from 'node:path';
import type {Run} from '~/commands/build';
import {THEME_CSS_PATH} from '~/constants';
import {
    BRAND_COLOR_KEYS,
    BRAND_COLOR_VARIABLE_PREFIX,
    ColorsOptions,
    DEFAULT_BRAND_DEPEND_COLORS,
    generateBrandShades,
    getThemeValidator,
    loadFile,
    Theme,
    THEME_GRAVITY_VARIABLE_PREFIX,
    THEME_VARIANTS,
    THEME_YFM_VARIABLE_PREFIX,
    ThemeConfig,
    ThemeOptions,
    ThemeVariant,
    YFM_COLOR_KEYS,
    YFMColorOptions,
} from './themer';
import {writeFileSync} from 'node:fs';

export async function processThemer(run: Run) {
    try {
        const configRaw = await loadFile(run.input);
        const validate = getThemeValidator();
        if (validate(configRaw)) {
            const theme = createTheme(configRaw as ThemeConfig);
            createCSS(theme, run.output);
        } else {
            throw Error(validate.errors ? validate.errors[0].message : 'validation error');
        }
    } catch (e) {
        run.logger.warn('Theme config error');
        run.logger.warn(e);
    }
}

function createTheme(configData: ThemeConfig): Theme {
    let theme: Theme = {};

    // if (configData['base-background']) {
    //     delete configData['base-background'];
    // }

    for (const key of BRAND_COLOR_KEYS) {
        if (configData[key]) {
            configData.light = configData.light ?? {};
            configData.dark = configData.dark ?? {};
            if (!configData.light[key]) {
                configData.light[key] = configData[key];
            }
            if (!configData.dark[key]) {
                configData.dark[key] = configData[key];
            }
        }
    }
    const hasBaseColors = Object.keys(configData).some((key) => key !== 'light' && key !== 'dark');

    if (hasBaseColors) {
        theme.base = createBaseVariant(configData);
    }
    if (configData.light) {
        theme.light = createVariant(configData, 'light');
    }
    if (configData.dark) {
        theme.dark = createVariant(configData, 'dark');
    }

    return theme;
}

function createVariant(
    configData: ThemeConfig,
    themeVariant: ThemeVariant,
): ThemeOptions | undefined {
    if (!configData[themeVariant]) {
        return;
    }

    const {'base-brand': brandColor, 'base-background': backgroundColor} = configData[themeVariant];
    let themeOptions: ThemeOptions = {colors: {}};

    if (brandColor || backgroundColor) {
        themeOptions.colors = {
            ...DEFAULT_BRAND_DEPEND_COLORS[themeVariant],
        };

        const oppositeVariant = THEME_VARIANTS.find((v) => v !== themeVariant) as ThemeVariant;
        const oppositeBg =
            configData[oppositeVariant]?.['base-background'] ??
            DEFAULT_BRAND_DEPEND_COLORS[oppositeVariant]['base-background'];

        themeOptions.palette = generateBrandShades({
            colorValue: brandColor ?? DEFAULT_BRAND_DEPEND_COLORS[themeVariant]['base-brand'],
            lightBg:
                themeVariant === 'light'
                    ? DEFAULT_BRAND_DEPEND_COLORS[oppositeVariant]['base-background']
                    : oppositeBg,
            darkBg:
                themeVariant === 'dark'
                    ? DEFAULT_BRAND_DEPEND_COLORS[oppositeVariant]['base-background']
                    : oppositeBg,
        });
    }

    themeOptions.colors = {
        ...themeOptions.colors,
        ...configData[themeVariant],
    };

    return themeOptions;
}

function createBaseVariant(configData: ThemeConfig): ThemeOptions {
    const baseColors: ColorsOptions = {};
    for (const key in configData) {
        if (!THEME_VARIANTS.includes(key as ThemeVariant)) {
            const option = key as keyof ColorsOptions;
            baseColors[option] = configData[option];
        }
    }
    return {
        colors: baseColors,
    };
}

function createCSS(theme: Theme, folderPath: AbsolutePath) {
    const themePath = resolve(folderPath, THEME_CSS_PATH);
    let cssText = '';
    cssText += prepareThemeVariables('base', theme);
    cssText += prepareThemeVariables('light', theme);
    cssText += prepareThemeVariables('dark', theme);
    writeFileSync(themePath, cssText);
}

function prepareThemeVariables(variant: ThemeVariant | 'base', theme: Theme) {
    if (!theme[variant]) return '';

    let css = '';
    if (variant === 'base') {
        const gravityColors = getGravityCSSColors(theme[variant].colors);
        const yfmCssVariables = getYFMCSSColors(theme[variant].colors);

        css += gravityColors ? `.g-root {\n${gravityColors}\n}\n\n` : '';
        css += yfmCssVariables ? `.yfm {\n${yfmCssVariables}\n}\n\n` : '';
    } else {
        let palette = '';
        if (theme[variant].palette) {
            palette = getPaletteCSSColors(theme[variant].palette);
        }
        const gravityColors = getGravityCSSColors(theme[variant].colors);
        const yfmCssVariables = getYFMCSSColors(theme[variant].colors);

        if (palette != '' || gravityColors) {
            css += `.g-root_theme_${variant} {\n${palette}\n${gravityColors}\n}\n\n`;
        }
        css += yfmCssVariables ? `.g-root_theme_${variant} .yfm {\n${yfmCssVariables}\n}\n\n` : '';
    }
    return css;
}

function getGravityCSSColors(colors: ColorsOptions): string | undefined {
    if (!colors) return;

    const css = Object.entries(colors)
        .filter(([key]) => !YFM_COLOR_KEYS.includes(key as keyof YFMColorOptions))
        .map(([key, value]) => `    ${THEME_GRAVITY_VARIABLE_PREFIX}-${key}: ${value};`)
        .join('\n');

    return css;
}

function getYFMCSSColors(colors: ColorsOptions): string | undefined {
    if (!colors) return;

    const css = Object.entries(colors)
        .filter(([key]) => YFM_COLOR_KEYS.includes(key as keyof YFMColorOptions))
        .map(([key, value]) => `    ${THEME_YFM_VARIABLE_PREFIX}-${key}: ${value};`)
        .join('\n');

    return css;
}

function getPaletteCSSColors(palette: Record<string, string>): string {
    const css = Object.entries(palette)
        .map(([key, value]) => `    ${BRAND_COLOR_VARIABLE_PREFIX}-${key}: ${value};`)
        .join('\n');

    return css;
}
