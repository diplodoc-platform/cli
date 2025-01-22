export interface ThemeConfig {
    light: ConfigColors;
    dark: ConfigColors;
}

export interface ConfigColors {
    'base-brand': string;
    'base-background'?: string;
    'base-selection'?: string;
    'brand-hover'?: string;
}
