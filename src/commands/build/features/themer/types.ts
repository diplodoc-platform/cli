import type {GravityTheme} from '@gravity-ui/uikit-themer';

export type ThemerArgs = {
    theme?: string;
};

export type ThemerConfig = {
    theme?: string | null;
};

export type ColorVariant = 'light' | 'dark';

export type UtilityColorKey = keyof GravityTheme['utilityColors'];

export type YfmCssVars = {
    light: string[];
    dark: string[];
};

export type ThemeColors = {
    [key: string]: string;
};

export type ThemeConfig = ThemeColors & {
    light?: ThemeColors;
    dark?: ThemeColors;
};
