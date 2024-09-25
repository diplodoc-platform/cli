// import {TextProps} from 'landing-uikit';
import capitalize from 'lodash/capitalize';
// import cloneDeep from 'lodash/cloneDeep';
// import kebabCase from 'lodash/kebabCase';
import lowerCase from 'lodash/lowerCase';
// import {v4 as uuidv4} from 'uuid';

import { kebabCase } from "lodash";
import { BrandPreset, THEME_COLOR_VARIABLE_PREFIX } from "./constants";
import { ColorsOptions, PaletteTokens, PrivateColors, ThemeOptions, ThemeState, ThemeVariant } from "./models";
import { generatePrivateColors } from "./lib/privateColors";

// import {
    // DEFAULT_NEW_COLOR_TITLE,
    // DEFAULT_PALETTE_TOKENS,
    // RADIUS_PRESETS,
    // THEME_BORDER_RADIUS_VARIABLE_PREFIX,
    // THEME_COLOR_VARIABLE_PREFIX,
// } from './constants';
// import {generatePrivateColors} from './privateColors';
// import type {
    // BordersOption,
    // Palette,
    // PaletteTokens,
    // RadiusValue,
// } from './types';
// import {CustomFontSelectType, RadiusPresetName, TypographyOptions} from './types';
// import {DefaultFontFamilyType, TextVariants, defaultTypographyPreset} from './typography/constants';
// import {
//     createFontFamilyVariable,
//     createFontLinkImport,
//     createTextFontFamilyVariable,
//     createTextFontSizeVariable,
//     createTextFontWeightVariable,
//     createTextLineHeightVariable,
//     getCustomFontTypeKey,
// } from './typography/utils';

function createColorToken(title: string) {
    return kebabCase(title);
}

function createTitleFromToken(token: string) {
    return capitalize(lowerCase(token));
}

export function createPrivateColorToken(mainColorToken: string, privateColorCode: string) {
    return `private.${mainColorToken}.${privateColorCode}`;
}

export function isPrivateColorToken(privateColorToken?: string) {
    if (!privateColorToken) {
        return false;
    }

    const parts = privateColorToken.split('.');

    if (parts.length !== 3 || parts[0] !== 'private') {
        return false;
    }

    return true;
}

export function parsePrivateColorToken(privateColorToken: string) {
    const parts = privateColorToken.split('.');

    if (parts.length !== 3 || parts[0] !== 'private') {
        return undefined;
    }

    return {
        mainColorToken: parts[1],
        privateColorCode: parts[2],
    };
}

export function createPrivateColorCssVariable(mainColorToken: string, privateColorCode: string) {
    return `${THEME_COLOR_VARIABLE_PREFIX}-private-${mainColorToken}-${privateColorCode}`;
}

export function createPrivateColorCssVariableFromToken(privateColorToken: string) {
    const result = parsePrivateColorToken(privateColorToken);

    if (result) {
        return createPrivateColorCssVariable(result.mainColorToken, result.privateColorCode);
    }

    return '';
}

export function createUtilityColorCssVariable(colorName: string) {
    return `${THEME_COLOR_VARIABLE_PREFIX}-${colorName}`;
}

// function isManuallyCreatedToken(token: string) {
//     return !DEFAULT_PALETTE_TOKENS.has(token);
// }

function createNewColorTitle(currentPaletteTokens: PaletteTokens) {
    let i = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {



        const DEFAULT_NEW_COLOR_TITLE = '' // TODO: взять шаблон откуда-то из @gravity-ui/landing themer



        const title = i === 0 ? DEFAULT_NEW_COLOR_TITLE : `${DEFAULT_NEW_COLOR_TITLE} ${i}`;
        const token = createColorToken(title);

        if (!currentPaletteTokens[token]) {
            return title;
        }

        i++;
    }
}

function createPrivateColors({
    themeVariant,
    colorToken,
    colorValue,
    theme,
}: {
    colorToken: string;
    colorValue: string;
    themeVariant: ThemeVariant;
    theme: ThemeOptions;
}): PrivateColors {
    return generatePrivateColors({
        theme: themeVariant,
        colorToken,
        colorValue,
        lightBg:
            themeVariant === 'light'
                ? theme.colors.light['base-background']
                : theme.colors.dark['base-background'],
        darkBg:
            themeVariant === 'light'
                ? theme.colors.dark['base-background']
                : theme.colors.light['base-background'],
    });
}

function createPalleteTokens(theme: ThemeOptions): PaletteTokens {
    const {palette} = theme;
    const tokens = Object.keys(palette.light);

    return tokens.reduce<PaletteTokens>(
        (acc, token) => ({
            ...acc,
            [token]: {
                title: createTitleFromToken(token),
                privateColors: {
                    light: palette.light[token]
                        ? createPrivateColors({
                              colorToken: token,
                              colorValue: palette.light[token],
                              theme,
                              themeVariant: 'light',
                          })
                        : undefined,
                    dark: palette.dark[token]
                        ? createPrivateColors({
                              colorToken: token,
                              colorValue: palette.dark[token],
                              theme,
                              themeVariant: 'dark',
                          })
                        : undefined,
                },
            },
        }),
        {},
    );
}

export type UpdateColorInThemeParams = {
    /** The title of the color to update. */
    title: string;
    /** The theme variant to update. */
    theme: ThemeVariant;
    /** The new value of the color. */
    value: string;
};

/**
 * Updates a color in the given theme state.
 *
 * @param {ThemeState} themeState - The current state of the theme.
 * @param {UpdateColorInThemeParams} params - The parameters for the color update.
 * @returns {ThemeState} The updated theme state.
 */
export function updateColorInTheme(
    themeState: ThemeState,
    params: UpdateColorInThemeParams,
): ThemeState {
    const newThemeState = {...themeState};
    const token = createColorToken(params.title);

    if (params.theme === 'light') {
        if (!newThemeState.palette.light[token]) {
            newThemeState.palette.light[token] = '';
        }

        newThemeState.palette.light[token] = params.value;
    }

    if (params.theme === 'dark') {
        if (!newThemeState.palette.dark[token]) {
            newThemeState.palette.dark[token] = '';
        }

        newThemeState.palette.dark[token] = params.value;
    }

    const privateColors = createPrivateColors({
        colorToken: token,
        colorValue: params.value,
        theme: newThemeState,
        themeVariant: params.theme,
    });

    newThemeState.paletteTokens[token] = {
        ...newThemeState.paletteTokens[token],
        title: params.title,
        privateColors: {
            light:
                params.theme === 'light'
                    ? privateColors
                    : newThemeState.paletteTokens[token]?.privateColors?.light,
            dark:
                params.theme === 'dark'
                    ? privateColors
                    : newThemeState.paletteTokens[token]?.privateColors?.dark,
        },
    };

    const isNewToken = !themeState.paletteTokens[token];
    if (isNewToken) {
        newThemeState.tokens.push(token);
    }

    return newThemeState;
}

export type AddColorToThemeParams =
    | {
          title?: string;
          colors?: Partial<Record<ThemeVariant, string>>;
      }
    | undefined;

// /**
//  * Adds a new color to the given theme state.
//  *
//  * @param {ThemeState} themeState - The current state of the theme.
//  * @param {AddColorToThemeParams} params - The parameters of the adding color.
//  * @returns {ThemeState} The updated theme state with the new color added.
//  */
export function addColorToTheme(
    themeState: ThemeState,
    params: AddColorToThemeParams,
): ThemeState {
    const newThemeState = {...themeState};
    const title = params?.title ?? createNewColorTitle(themeState.paletteTokens);
    const token = createColorToken(title);

    if (!themeState.palette.dark[token]) {
        newThemeState.palette.dark = {
            ...newThemeState.palette.dark,
            [token]: '',
        };
    }

    if (!themeState.palette.light[token]) {
        newThemeState.palette.light = {
            ...newThemeState.palette.light,
            [token]: '',
        };
    }

    if (params?.colors?.dark) {
        newThemeState.palette.dark = {
            ...newThemeState.palette.dark,
            [token]: params.colors.dark,
        };
    }

    if (params?.colors?.light) {
        newThemeState.palette.light = {
            ...newThemeState.palette.light,
            [token]: params.colors.light,
        };
    }

    newThemeState.paletteTokens = {
        ...newThemeState.paletteTokens,
        [token]: {
            ...newThemeState.paletteTokens[token],
            title,
            privateColors: {
                light: params?.colors?.light
                    ? createPrivateColors({
                          colorToken: token,
                          colorValue: params.colors.light,
                          theme: newThemeState,
                          themeVariant: 'light',
                      })
                    : undefined,
                dark: params?.colors?.dark
                    ? createPrivateColors({
                          colorToken: token,
                          colorValue: params.colors.dark,
                          theme: newThemeState,
                          themeVariant: 'dark',
                      })
                    : undefined,
            },
            isCustom: true,
        },
    };

    newThemeState.tokens = [...newThemeState.tokens, token];

    return newThemeState;
}

// export function removeColorFromTheme(
//     themeState: ThemeCreatorState,
//     colorTitle: string,
// ): ThemeCreatorState {
//     const newThemeState = {...themeState};
//     const token = createColorToken(colorTitle);

//     delete newThemeState.palette.dark[token];
//     delete newThemeState.palette.light[token];
//     delete newThemeState.paletteTokens[token];

//     newThemeState.tokens = newThemeState.tokens.filter((t) => t !== token);

//     return newThemeState;
// }

// export type RenameColorInThemeParams = {
//     oldTitle: string;
//     newTitle: string;
// };

// export function renameColorInTheme(
//     themeState: ThemeCreatorState,
//     {oldTitle, newTitle}: RenameColorInThemeParams,
// ): ThemeCreatorState {
//     const newThemeState = {...themeState};
//     const oldToken = createColorToken(oldTitle);
//     const newToken = createColorToken(newTitle);

//     if (newThemeState.paletteTokens[oldToken]) {
//         newThemeState.paletteTokens[newToken] = {
//             ...newThemeState.paletteTokens[oldToken],
//             title: newTitle,
//         };
//         newThemeState.palette.dark[newToken] = newThemeState.palette.dark[oldToken];
//         newThemeState.palette.light[newToken] = newThemeState.palette.light[oldToken];
//     }

//     newThemeState.tokens = newThemeState.tokens.map((token) =>
//         token === oldToken ? newToken : token,
//     );

//     delete newThemeState.palette.dark[oldToken];
//     delete newThemeState.palette.light[oldToken];
//     delete newThemeState.paletteTokens[oldToken];

//     return newThemeState;
// }

// export type ThemeColorOption = {
//     token: string;
//     title: string;
//     color: string;
//     privateColors: {
//         token: string;
//         title: string;
//         color: string;
//     }[];
// };

// /**
//  * Generates theme color options from the given palette tokens and theme variant.
//  *
//  * @param {Object} params - The parameters for generating theme color options.
//  * @param {PaletteTokens} params.paletteTokens - The palette tokens to generate options from.
//  * @param {ThemeVariant} params.themeVariant - The theme variant to filter private colors (light, dark).
//  * @returns {ThemeColorOption[]} The generated theme color options.
//  */
// export function getThemeColorOptions({
//     themeState,
//     themeVariant,
// }: {
//     themeState: ThemeCreatorState;
//     themeVariant: ThemeVariant;
// }) {
//     const {tokens, paletteTokens, palette} = themeState;

//     return tokens.reduce<ThemeColorOption[]>((acc, token) => {
//         if (paletteTokens[token]?.privateColors[themeVariant]) {
//             return [
//                 ...acc,
//                 {
//                     token,
//                     color: palette[themeVariant][token],
//                     title: paletteTokens[token].title,
//                     privateColors: Object.entries(
//                         paletteTokens[token].privateColors[themeVariant]!,
//                     ).map(([privateColorCode, color]) => ({
//                         token: createPrivateColorToken(token, privateColorCode),
//                         title: createPrivateColorCssVariable(token, privateColorCode),
//                         color,
//                     })),
//                 },
//             ];
//         }

//         return acc;
//     }, []);
// }

export type ChangeUtilityColorInThemeParams = {
    themeVariant: ThemeVariant;
    name: keyof ColorsOptions;
    value: string;
};

export function changeUtilityColorInTheme(
    themeState: ThemeState,
    {themeVariant, name, value}: ChangeUtilityColorInThemeParams,
): ThemeState {
    const newState = {...themeState};
    newState.colors[themeVariant][name] = value;

    if (name === 'base-background') {
        newState.paletteTokens = createPalleteTokens(newState);
    }

    return newState;
}

// ******
// * applyBrandPresetToTheme позволяет применить пресет для brand-color
// * то есть использовать готовый цвет, а не свой цвет в RGB
// * это можно использовать для более простой кастомизации через конфиг
export function applyBrandPresetToTheme(
    themeState: ThemeState,
    {brandColor, colors}: BrandPreset,
): ThemeState {
    let newState = {...themeState};

    (['light', 'dark'] as const).forEach((theme) => {
        newState = updateColorInTheme(newState, {
            theme,
            title: 'brand',
            value: brandColor,
        });
    });

    newState.colors.light = {...colors.light};
    newState.colors.dark = {...colors.dark};

    return newState;
}

// ? может не пригодиться
// export function getThemePalette(theme: ThemeCreatorState): Palette {
//     return theme.tokens.map((token) => {
//         return {
//             title: theme.paletteTokens[token]?.title || '',
//             colors: {
//                 light: theme.palette.light[token],
//                 dark: theme.palette.dark[token],
//             },
//             isCustom: isManuallyCreatedToken(token),
//         };
//     });
// }

// ! если мы не будем использовать кастомные СКРУГЛЕНИЯ УГЛОВ
// export type ChangeRadiusPresetInThemeParams = {
//     radiusPresetName: RadiusPresetName;
// };

// ! если мы не будем использовать кастомные СКРУГЛЕНИЯ УГЛОВ
// export function changeRadiusPresetInTheme(
//     themeState: ThemeCreatorState,
//     {radiusPresetName}: ChangeRadiusPresetInThemeParams,
// ): ThemeCreatorState {
//     const newBorderValue = {
//         preset: radiusPresetName,
//         values: {...RADIUS_PRESETS[radiusPresetName]},
//     };

//     return {...themeState, borders: newBorderValue};
// }

// ! если мы не будем использовать кастомные СКРУГЛЕНИЯ УГЛОВ
// export type UpdateCustomRadiusPresetInThemeParams = {radiusValue: Partial<RadiusValue>};

// ! если мы не будем использовать кастомные СКРУГЛЕНИЯ УГЛОВ
// export function updateCustomRadiusPresetInTheme(
//     themeState: ThemeCreatorState,
//     {radiusValue}: UpdateCustomRadiusPresetInThemeParams,
// ): ThemeCreatorState {
//     const previousRadiusValues = themeState.borders.values;
//     const newCustomPresetValues = {
//         preset: RadiusPresetName.Custom,
//         values: {...previousRadiusValues, ...radiusValue},
//     };

//     return {...themeState, borders: newCustomPresetValues};
// }

// function createBorderRadiusCssVariable(radiusSize: string) {
//     return `${THEME_BORDER_RADIUS_VARIABLE_PREFIX}-${radiusSize}`;
// }

// ! если мы не будем использовать кастомные СКРУГЛЕНИЯ УГЛОВ
// /**
//  * Generates ready-to-use in css string with borders variables
//  * @returns string
//  */
// export function createBorderRadiusPresetForExport({
//     borders,
//     forPreview,
//     ignoreDefaultValues,
// }: {
//     borders: BordersOption;
//     ignoreDefaultValues: boolean;
//     forPreview: boolean;
// }) {
//     // Don't export radius preset that are equals to default
//     if (ignoreDefaultValues && borders.preset === RadiusPresetName.Regular) {
//         return '';
//     }
//     let cssString = '';
//     Object.entries(borders.values).forEach(([radiusName, radiusValue]) => {
//         if (radiusValue) {
//             cssString += `${createBorderRadiusCssVariable(radiusName)}: ${radiusValue}px${
//                 forPreview ? ' !important' : ''
//             };\n`;
//         }
//     });
//     return cssString;
// }

// ! если мы не будем использовать кастомные шрифты, то это не нужно
// export type UpdateFontFamilyParams = {
//     fontType: DefaultFontFamilyType | string;
//     fontWebsite?: string;
//     isCustom?: boolean;
//     customType?: string;
//     value?: {
//         title: string;
//         key: string;
//         link: string;
//         alternatives: string[];
//     };
// };

// ! если мы не будем использовать кастомные шрифты, то это не нужно
// export function updateFontFamilyInTheme(
//     themeState: ThemeCreatorState,
//     {fontType, value, isCustom, fontWebsite, customType}: UpdateFontFamilyParams,
// ): ThemeCreatorState {
//     const previousFontFamilySettings = themeState.typography.baseSetting.fontFamilies;

//     const newFontFamilySettings = {
//         ...previousFontFamilySettings,
//         [fontType]: {
//             ...previousFontFamilySettings[fontType],
//             ...(value || {}),
//             isCustom,
//             customType: customType || previousFontFamilySettings[fontType].customType,
//             fontWebsite,
//         },
//     };

//     return {
//         ...themeState,
//         typography: {
//             ...themeState.typography,
//             baseSetting: {
//                 ...themeState.typography.baseSetting,
//                 fontFamilies: newFontFamilySettings,
//             },
//         },
//     };
// }

// export type AddFontFamilyTypeParams = {
//     title: string;
// };

// export function addFontFamilyTypeInTheme(
//     themeState: ThemeCreatorState,
//     {title}: AddFontFamilyTypeParams,
// ): ThemeCreatorState {
//     const {customFontFamilyType} = themeState.typography.baseSetting;
//     const newFontType = `custom-font-type-${uuidv4()}`;

//     const newCustomFontFamily = [
//         ...customFontFamilyType,
//         {
//             value: newFontType,
//             content: title,
//         },
//     ];

//     return {
//         ...themeState,
//         typography: {
//             ...themeState.typography,
//             baseSetting: {
//                 ...themeState.typography.baseSetting,
//                 fontFamilies: {
//                     ...themeState.typography.baseSetting.fontFamilies,
//                     [newFontType]: {
//                         isCustom: true,
//                         customType: CustomFontSelectType.GoogleFonts,
//                         title: '',
//                         key: '',
//                         link: '',
//                         alternatives: [],
//                     },
//                 },
//                 customFontFamilyType: newCustomFontFamily,
//             },
//         },
//     };
// }

// ! если мы не будем использовать кастомные шрифты, то это не нужно
// export type UpdateFontFamilyTypeTitleParams = {
//     title: string;
//     familyType: string;
// };

// ! если мы не будем использовать кастомные шрифты, то это не нужно
// export function updateFontFamilyTypeTitleInTheme(
//     themeState: ThemeCreatorState,
//     {title, familyType}: UpdateFontFamilyTypeTitleParams,
// ): ThemeCreatorState {
//     const {customFontFamilyType} = themeState.typography.baseSetting;

//     const newCustomFontFamily = customFontFamilyType.map((fontFamilyType) => {
//         return fontFamilyType.value === familyType
//             ? {
//                   content: title,
//                   value: familyType,
//               }
//             : fontFamilyType;
//     });

//     return {
//         ...themeState,
//         typography: {
//             ...themeState.typography,
//             baseSetting: {
//                 ...themeState.typography.baseSetting,
//                 customFontFamilyType: newCustomFontFamily,
//             },
//         },
//     };
// }

// ! если мы не будем использовать кастомные шрифты, то это не нужно
// export function removeFontFamilyTypeFromTheme(
//     themeState: ThemeCreatorState,
//     {fontType}: {fontType: string},
// ): ThemeCreatorState {
//     const {customFontFamilyType, fontFamilies} = themeState.typography.baseSetting;

//     const {[fontType]: _, ...restFontFamilies} = fontFamilies;

//     const newCustomFontFamilyType = customFontFamilyType.filter(
//         (fontFamily) => fontFamily.value !== fontType,
//     );

//     const newAdvanced = cloneDeep(themeState.typography.advanced);

//     // Reset selected font to default
//     Object.entries(newAdvanced).forEach(([textVariant, settings]) => {
//         if (settings.selectedFontFamilyType === fontType) {
//             newAdvanced[textVariant as TextVariants].selectedFontFamilyType =
//                 defaultTypographyPreset.advanced[
//                     textVariant as TextVariants
//                 ].selectedFontFamilyType;
//         }
//     });

//     return {
//         ...themeState,
//         typography: {
//             ...themeState.typography,
//             advanced: newAdvanced,
//             baseSetting: {
//                 ...themeState.typography.baseSetting,
//                 fontFamilies: restFontFamilies,
//                 customFontFamilyType: newCustomFontFamilyType,
//             },
//         },
//     };
// }

// ! если мы не будем использовать кастомные шрифты, то это не нужно
// export type UpdateAdvancedTypographySettingsParams = {
//     key: TextVariants;
//     fontWeight?: number;
//     selectedFontFamilyType?: string;
//     sizeKey?: Exclude<TextProps['variant'], undefined>;
//     fontSize?: number;
//     lineHeight?: number;
// };

// ! если мы не будем использовать кастомные шрифты, то это не нужно
// export function updateAdvancedTypographySettingsInTheme(
//     themeState: ThemeCreatorState,
//     {
//         key,
//         fontSize,
//         selectedFontFamilyType,
//         sizeKey,
//         fontWeight,
//         lineHeight,
//     }: UpdateAdvancedTypographySettingsParams,
// ): ThemeCreatorState {
//     const previousTypographyAdvancedSettings = themeState.typography.advanced;

//     const newSizes = sizeKey
//         ? {
//               [sizeKey]: {
//                   ...previousTypographyAdvancedSettings[key].sizes[sizeKey],
//                   fontSize:
//                       fontSize ?? previousTypographyAdvancedSettings[key].sizes[sizeKey]?.fontSize,
//                   lineHeight:
//                       lineHeight ??
//                       previousTypographyAdvancedSettings[key].sizes[sizeKey]?.lineHeight,
//               },
//           }
//         : {};

//     const newTypographyAdvancedSettings = {
//         ...previousTypographyAdvancedSettings,
//         [key]: {
//             ...previousTypographyAdvancedSettings[key],
//             fontWeight: fontWeight ?? previousTypographyAdvancedSettings[key].fontWeight,
//             selectedFontFamilyType:
//                 selectedFontFamilyType ??
//                 previousTypographyAdvancedSettings[key].selectedFontFamilyType,
//             sizes: {
//                 ...previousTypographyAdvancedSettings[key].sizes,
//                 ...newSizes,
//             },
//         },
//     };

//     return {
//         ...themeState,
//         typography: {
//             ...themeState.typography,
//             advanced: {
//                 ...newTypographyAdvancedSettings,
//             },
//         },
//     };
// }

// ! если мы не будем использовать кастомные шрифты, то это не нужно
// export const updateAdvancedTypographyInTheme = (
//     themeState: ThemeCreatorState,
// ): ThemeCreatorState => {
//     return {
//         ...themeState,
//         typography: {
//             ...themeState.typography,
//             isAdvancedActive: !themeState.typography.isAdvancedActive,
//         },
//     };
// };

// ! если мы не будем использовать кастомные шрифты, то это не нужно
// export const createFontImportsForExport = (
//     fontFamily: TypographyOptions['baseSetting']['fontFamilies'],
// ) => {
//     let cssString = '';

//     Object.entries(fontFamily).forEach(([, value]) => {
//         cssString += `${createFontLinkImport(value.link)}\n`;
//     });

//     return cssString;
// };

// export const createTypographyPresetForExport = ({
//     typography,
//     forPreview,
// }: {
//     typography: TypographyOptions;
//     ignoreDefaultValues: boolean;
//     forPreview: boolean;
// }) => {
//     const {baseSetting, advanced} = typography;
//     let cssString = '';

//     Object.entries(baseSetting.fontFamilies).forEach(([key, value]) => {
//         const customFontKey = getCustomFontTypeKey(key, baseSetting.customFontFamilyType);

//         cssString += `${createFontFamilyVariable(
//             customFontKey ? kebabCase(customFontKey) : key,
//             value.title,
//             value.alternatives,
//             forPreview,
//         )}\n`;
//     });

//     Object.entries(advanced).forEach(([key, data]) => {
//         const defaultAdvancedSetting = defaultTypographyPreset.advanced[key as TextVariants];

//         if (defaultAdvancedSetting.selectedFontFamilyType !== data.selectedFontFamilyType) {
//             const customFontTypeKey = getCustomFontTypeKey(
//                 data.selectedFontFamilyType,
//                 baseSetting.customFontFamilyType,
//             );

//             cssString += `${createTextFontFamilyVariable(
//                 key as TextVariants,
//                 customFontTypeKey ? kebabCase(customFontTypeKey) : data.selectedFontFamilyType,
//                 forPreview,
//             )}\n`;
//         }
//         if (defaultAdvancedSetting.fontWeight !== data.fontWeight) {
//             cssString += `${createTextFontWeightVariable(
//                 key as TextVariants,
//                 data.fontWeight,
//                 forPreview,
//             )}\n`;
//             cssString += '\n';
//         }

//         Object.entries(data.sizes).forEach(([sizeKey, sizeData]) => {
//             if (
//                 defaultAdvancedSetting.sizes[sizeKey as Exclude<TextProps['variant'], undefined>]
//                     ?.fontSize !== sizeData.fontSize
//             ) {
//                 cssString += `${createTextFontSizeVariable(
//                     sizeKey as TextProps['variant'],
//                     sizeData.fontSize,
//                     forPreview,
//                 )}\n`;
//             }

//             if (
//                 defaultAdvancedSetting.sizes[sizeKey as Exclude<TextProps['variant'], undefined>]
//                     ?.lineHeight !== sizeData.lineHeight
//             ) {
//                 cssString += `${createTextLineHeightVariable(
//                     sizeKey as TextProps['variant'],
//                     sizeData.lineHeight,
//                     forPreview,
//                 )}\n`;
//                 cssString += '\n';
//             }
//         });
//     });

//     return cssString;
// };
