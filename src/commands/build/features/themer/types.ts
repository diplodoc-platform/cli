import type {GravityTheme} from '@gravity-ui/uikit-themer';

export type ThemerArgs = {
    theme?: string;
};

export type ThemerConfig = {
    theme?: string | null;
};

export type ColorVariant = ['light', 'dark'];

export type UtilityColorKey = keyof GravityTheme['utilityColors'];

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
