// ! const hexColorRegexp = /^#([0-9a-fA-F]{3}){1,2}$/;
const rgbColorRegexp = /^rgb\((([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])), ?(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])), ?(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]))\)$/;

export type ThemeVariant = 'light' | 'dark';

type RegexMatchedString<Pattern extends RegExp> =
    `${string & { __brand: Pattern }}`;

/**
 * String that describes the color in **HEX** format
 *  - #fff - true
 *  - #FFF - true
 *  - #fffff - true
 *  - #FFFfff - true
 *  - #ffffff00 - false (without opacity)
 */
// ? support HEX color format
// ! type HEX = RegexMatchedString<typeof hexColorRegexp>;

/**
 * String that describes the color in **RGB** format
 *  - rgb(255, 255, 255) - true
 *  - rgb(128,128,128) - true
 *  - rgb(0,0, 0) - true
 *  - rgb(300, 0, 0) - false
 *  - rgb(256, 256, 256) - false
 */
type RGB = RegexMatchedString<typeof rgbColorRegexp>;

export enum DefaultColorsNames {
    white = 'white',
    black = 'black',
    orange = 'orange',
    green = 'green',
    yellow = 'yellow',
    red = 'red',
    blue = 'blue',
    'cool-gray' = 'cool-gray',
    purple = 'purple',
}

// *****
// DefaultColorsNames это название цвета, далее через него нужно обращаться в LightThemeDefaultColors вот так: LightThemeDefaultColors['white]
// Выбирать LightThemeDefaultColors или DarkThemeDefaultColors на основе того какой ThemeVariant мы сейчас смотрим
// TODO: скорее всего нужно будет переводить HEX в RGB или просто раскладывать на объекты
// export type Color = RGB | HEX | DefaultColorsNames;
export type Color = RGB | DefaultColorsNames;

export type PaletteOptions = {
    brand: string;
    [key: string]: string;
};

export type ColorsOptions = {
    'base-background': string;
    'base-brand-hover': string;
    'base-selection': string;
    'base-selection-hover': string;
    'line-brand': string;
    'text-brand': string;
    'text-brand-heavy': string;
    'text-brand-contrast': string;
    'text-link': string;
    'text-link-hover': string;
    'text-link-visited': string;
    'text-link-visited-hover': string;
};

export interface ThemeOptions {
    /** Values of solid colors, from which private colors are calculated */
    palette: Record<ThemeVariant, PaletteOptions>;
    /** Utility colors that used in components (background, link, brand-text, etc.) */
    colors: Record<ThemeVariant, ColorsOptions>;

    // now we don't use custom typography
    // typography: TypographyOptions;
}

export type PrivateColors = Record<string, string>; // ?

type PaletteToken = { // ?
    /** Title that will using in UI */
    title: string;
    /** Is color manually created */
    isCustom?: boolean;
    /** Auto-generated private colors for each theme variant */
    privateColors: Record<ThemeVariant, PrivateColors | undefined>;
};

export type PaletteTokens = Record<string, PaletteToken>; // ?

export interface ThemeState extends ThemeOptions {
    /** Mapping color tokens to their information (title and private colors) */
    paletteTokens: PaletteTokens; // ?
    /** All available palette tokens in theme */
    tokens: string[]; // ?
    // ! showMainSettings: boolean;
    // ! advancedModeEnabled: boolean;
    // ! changesExist: boolean;
}
