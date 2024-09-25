import {DEFAULT_PALETTE, DEFAULT_THEME} from './constants';
import {ThemeState, ThemeVariant} from './models';
import {createPrivateColorCssVariable, createPrivateColorCssVariableFromToken, createPrivateColorToken, createUtilityColorCssVariable, isPrivateColorToken} from './themeCreatorUtils';
// import {
//     createBorderRadiusPresetForExport,
//     createFontImportsForExport,
//     createPrivateColorCssVariable,
//     createPrivateColorCssVariableFromToken,
//     createPrivateColorToken,
//     createTypographyPresetForExport,
//     createUtilityColorCssVariable,
//     isPrivateColorToken,
// } from './themeCreatorUtils';
// import type {ThemeCreatorState, ThemeVariant} from './types';

const COMMON_VARIABLES_TEMPLATE_NAME = '%COMMON_VARIABLES%';
const LIGHT_THEME_VARIABLES_TEMPLATE_NAME = '%LIGHT_THEME_VARIABLES%';
const DARK_THEME_VARIABLES_TEMPLATE_NAME = '%DARK_THEME_VARIABLES%';
const FONTS_TEMPLATE_NAME = '%IMPORT_FONTS%';

const SCSS_TEMPLATE = `
@use '@gravity-ui/uikit/styles/themes';

${' ' || FONTS_TEMPLATE_NAME}

.g-root {
    @include themes.g-theme-common;

    ${' ' || COMMON_VARIABLES_TEMPLATE_NAME}

    .g-root_theme_light {
        @include themes.g-theme-light;

        ${LIGHT_THEME_VARIABLES_TEMPLATE_NAME}
    }

    .g-root_theme_dark {
        @include themes.g-theme-dark;

       ${DARK_THEME_VARIABLES_TEMPLATE_NAME}
    }
}
`.trim();

type ExportThemeParams = {
    themeState: ThemeState;
    ignoreDefaultValues?: boolean;
    forPreview?: boolean;
};

const isBackgroundColorChanged = (themeState: ThemeState) => {
    return (
        DEFAULT_THEME.colors.dark['base-background'] !==
            themeState.colors.dark['base-background'] ||
        DEFAULT_THEME.colors.light['base-background'] !== themeState.colors.light['base-background']
    );
};

export function exportTheme({
    themeState,
    ignoreDefaultValues = true,
    forPreview = true,
}: ExportThemeParams) {
    const {paletteTokens, palette} = themeState;
    const backgroundColorChanged = isBackgroundColorChanged(themeState);

    const prepareThemeVariables = (themeVariant: ThemeVariant) => {
        let cssVariables = '';
        const privateColors: Record<string, string> = {};

        themeState.tokens.forEach((token) => {
            // Dont export colors that are equals to default (except brand color)
            // Private colors recalculate when background color changes
            const valueEqualsToDefault =
                DEFAULT_PALETTE[themeVariant][token] === themeState.palette[themeVariant][token] &&
                token !== 'brand' &&
                !backgroundColorChanged;

            if (valueEqualsToDefault && ignoreDefaultValues) {
                return;
            }

            const needExportColor =
                backgroundColorChanged || token === 'brand' || !valueEqualsToDefault;

            if (!needExportColor) {
                return;
            }

            if (paletteTokens[token]?.privateColors[themeVariant]) {
                Object.entries(paletteTokens[token].privateColors[themeVariant]!).forEach(
                    ([privateColorCode, color]) => {
                        privateColors[createPrivateColorToken(token, privateColorCode)] = color;
                        cssVariables += `${createPrivateColorCssVariable(
                            token,
                            privateColorCode,
                        )}: ${color}${forPreview ? ' !important' : ''};\n`;
                    },
                );
                cssVariables += '\n';
            }
        });

        cssVariables += '\n';

        cssVariables += `${createUtilityColorCssVariable('base-brand')}: ${
            palette[themeVariant].brand
        }${forPreview ? ' !important' : ''};\n`;

        Object.entries(themeState.colors[themeVariant]).forEach(
            ([colorName, colorOrPrivateToken]) => {
                const color = isPrivateColorToken(colorOrPrivateToken)
                    ? `var(${createPrivateColorCssVariableFromToken(colorOrPrivateToken)})`
                    : colorOrPrivateToken;

                cssVariables += `${createUtilityColorCssVariable(colorName)}: ${color}${
                    forPreview ? ' !important' : ''
                };\n`;
            },
        );

        // if (forPreview) {
        //     cssVariables += createBorderRadiusPresetForExport({
        //         borders: themeState.borders,
        //         forPreview,
        //         ignoreDefaultValues,
        //     });

        //     cssVariables += createTypographyPresetForExport({
        //         typography: themeState.typography,
        //         ignoreDefaultValues,
        //         forPreview,
        //     });
        // }

        return cssVariables.trim();
    };

    // const prepareCommonThemeVariables = () => {
    //     const borderRadiusVariabels = createBorderRadiusPresetForExport({
    //         borders: themeState.borders,
    //         forPreview,
    //         ignoreDefaultValues,
    //     });

    //     const typographyVariables = createTypographyPresetForExport({
    //         typography: themeState.typography,
    //         ignoreDefaultValues,
    //         forPreview,
    //     });

    //     return borderRadiusVariabels + '\n' + typographyVariables;
    // };

    return {
        // fontImports: createFontImportsForExport(themeState.typography.baseSetting.fontFamilies),
        // common: prepareCommonThemeVariables(),
        light: prepareThemeVariables('light'),
        dark: prepareThemeVariables('dark'),
    };
}

type ExportThemeForDialogParams = Pick<ExportThemeParams, 'themeState'>;

export function exportThemeForCSS({themeState}: ExportThemeForDialogParams): string {
    const {/*common,*/ light, dark /*fontImports*/} = exportTheme({
        themeState,
        forPreview: false,
    });

    return SCSS_TEMPLATE /*.replace(FONTS_TEMPLATE_NAME, fontImports)*/
    // .replace(
    //     COMMON_VARIABLES_TEMPLATE_NAME,
    //     replaceAll(common, '\n', '\n'.padEnd(5)),
    // )
        .replace(LIGHT_THEME_VARIABLES_TEMPLATE_NAME, replaceAll(light, '\n', '\n'.padEnd(9)))
        .replace(DARK_THEME_VARIABLES_TEMPLATE_NAME, replaceAll(dark, '\n', '\n'.padEnd(9)));
}

// TODO: check this
function replaceAll(target: string, searchValue: string | RegExp, replaceValue: string): string {
    // Если searchValue - это строка, конвертируем его в регулярное выражение с глобальным флагом 'g'
    if (typeof searchValue === 'string') {
        searchValue = new RegExp(escapeRegExp(searchValue), 'g');
    }
    // Используем метод replace для замены всех вхождений searchValue на replaceValue
    return target.replace(searchValue, replaceValue);
}

// Функция для экранирования специальных символов в строке
function escapeRegExp(string: string): string {
    // Экранируют такие символы, как ., *, +, ?, ^, $, (, ), [, ], {, }, |, \ в регулярных выражениях
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
