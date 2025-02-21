import {resolve} from 'node:path';
import {THEME_CONFIG_FILENAME} from '~/constants';
import chroma from 'chroma-js';
import {
    BRAND_COLOR_VARIABLE_PREFIX,
    COLOR_MAP,
    DEFAULT_BRAND_DEPEND_COLORS,
    PRIVATE_SOLID_VARIABLES,
    PRIVATE_VARIABLES,
    THEME_GRAVITY_VARIABLE_PREFIX,
    THEME_VARIANTS,
    THEME_YFM_VARIABLE_PREFIX,
} from './constants';
import {isFileExists} from '@diplodoc/transform/lib/utilsFS';
import {
    BRAND_COLOR_KEYS,
    ColorsOptions,
    Theme,
    ThemeConfig,
    ThemeOptions,
    ThemeVariant,
    YFMColorOptions,
    YFM_COLOR_KEYS,
} from './types';

export function isThemeExists(folderPath: AbsolutePath) {
    return isFileExists(resolve(folderPath, THEME_CONFIG_FILENAME));
}

export const generateBrandShades = ({
    colorValue,
    lightBg,
    darkBg,
}: {
    colorValue: string;
    lightBg: string;
    darkBg: string;
}) => {
    const privateColors: Record<string, string> = {};

    if (!chroma.valid(colorValue)) {
        throw Error('Not valid color for chroma');
    }

    const pallete = Object.entries(COLOR_MAP).reduce(
        (res, [key, {a, c}]) => {
            const solidColor = chroma.mix(colorValue, c > 0 ? darkBg : lightBg, 1 - a, 'rgb').css();

            const alphaColor = chroma(colorValue).alpha(a).css();

            res[key] = [solidColor, alphaColor];

            return res;
        },
        {} as Record<string, [string, string]>,
    );

    // Set 550 Solid Color
    privateColors[`550-solid`] = chroma(colorValue).css();

    // Set 50-1000 Solid Colors, except 550 Solid Color
    PRIVATE_SOLID_VARIABLES.forEach((varName) => {
        privateColors[`${varName}-solid`] = chroma(pallete[varName][0]).css();
    });

    // Set 50-500 Colors
    PRIVATE_VARIABLES.forEach((varName) => {
        privateColors[`${varName}`] = chroma(pallete[varName][1]).css();
    });

    return privateColors;
};

export function createTheme(configData: ThemeConfig): Theme {
    const theme: Theme = {};

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
    const themeOptions: ThemeOptions = {colors: {}};

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

export function createCSS(theme: Theme): string {
    let cssText = '';
    cssText += prepareThemeVariables('base', theme);
    cssText += prepareThemeVariables('light', theme);
    cssText += prepareThemeVariables('dark', theme);
    return cssText;
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

        if (palette !== '' || gravityColors) {
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
