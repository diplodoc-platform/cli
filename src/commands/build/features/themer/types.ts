import type {UtilityColors} from '@gravity-ui/uikit-themer/dist/types';

export type ThemerArgs = {
    theme?: string;
};

export type ThemerConfig = {
    theme?: string;
};

export type ColorVariant = ['light', 'dark'];

export type UtilityColorKey = keyof UtilityColors;

export type YfmCssVars = {
    light: string[];
    dark: string[];
};

export type ThemeConfig = {
    [key: string]: string | undefined;
} & {
    light?: {
        [key: string]: string;
    };
    dark?: {
        [key: string]: string;
    };
};
