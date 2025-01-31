import {resolve} from 'node:path';
import type {Run} from '~/commands/build';
import {THEME_CSS_PATH} from '~/constants';
import {
    BRAND_COLOR_VARIABLE_PREFIX,
    ColorsOptions,
    DEFAULT_BRAND_DEPEND_COLORS,
    generateBrandShades,
    getThemeValidator,
    loadFile,
    Theme,
    THEME_GRAVITY_VARIABLE_PREFIX,
    THEME_YFM_VARIABLE_PREFIX,
    ThemeConfig,
    ThemeOptions,
    ThemeVariant,
    YFM_COLOR_KEYS,
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
        console.log(e);
    }
}

function createTheme(configData: ThemeConfig): Theme {
    return {
        light: createVariant({configData, themeVariant: 'light'}),
        dark: createVariant({configData, themeVariant: 'dark'}),
    };
}

function createVariant({
    configData,
    themeVariant,
}: {
    configData: ThemeConfig;
    themeVariant: ThemeVariant;
}): ThemeOptions {
    const brandColor = configData[themeVariant]['base-brand'];
    const backgroundColor = configData[themeVariant]['base-background'];
    let themeOptions: ThemeOptions = {colors: {}, palette: {}};

    if (brandColor || backgroundColor) {
        themeOptions.colors = {
            ...DEFAULT_BRAND_DEPEND_COLORS[themeVariant],
        };

        const opposedVariant = themeVariant === 'light' ? 'dark' : 'light';
        const opossedBg =
            configData[opposedVariant]['base-background'] ??
            DEFAULT_BRAND_DEPEND_COLORS[opposedVariant]['base-background'];

        themeOptions.palette = generateBrandShades({
            colorValue: brandColor ?? DEFAULT_BRAND_DEPEND_COLORS[themeVariant]['base-brand'],
            lightBg:
                themeVariant === 'light'
                    ? DEFAULT_BRAND_DEPEND_COLORS[opposedVariant]['base-background']
                    : opossedBg,
            darkBg:
                themeVariant === 'dark'
                    ? DEFAULT_BRAND_DEPEND_COLORS[opposedVariant]['base-background']
                    : opossedBg,
        });
    }

    for (const [key, value] of Object.entries(configData[themeVariant])) {
        themeOptions.colors[key as keyof ColorsOptions] = value;
    }

    return themeOptions;
}

function createCSS(theme: Theme, folderPath: AbsolutePath) {
    const themePath = resolve(folderPath, THEME_CSS_PATH);
    let cssText = '';
    cssText += prepareThemeVariables('light', theme);
    cssText += prepareThemeVariables('dark', theme);

    writeFileSync(themePath, cssText);
}

function prepareThemeVariables(themeVariant: ThemeVariant, theme: Theme) {
    const INDENTATION = '    ';
    const mainSelector = `.g-root_theme_${themeVariant}`;
    const yfmSelector = `${mainSelector} .yfm`;

    const cssVariables: string[] = [];
    const yfmCssVariables: string[] = [];

    cssVariables.push(`${mainSelector} {`);

    const pallete = Object.entries(theme[themeVariant].palette).map(
        ([code, color]) => `${INDENTATION}${BRAND_COLOR_VARIABLE_PREFIX}-${code}: ${color};`,
    );

    cssVariables.push(...pallete);
    cssVariables.push('\n');

    Object.entries(theme[themeVariant].colors).forEach(([code, color]) => {
        if (YFM_COLOR_KEYS.includes(code)) {
            yfmCssVariables.push(`${INDENTATION}${THEME_YFM_VARIABLE_PREFIX}-${code}: ${color};`);
        } else {
            cssVariables.push(`${INDENTATION}${THEME_GRAVITY_VARIABLE_PREFIX}-${code}: ${color};`);
        }
    });

    cssVariables.push('}\n');

    if (yfmCssVariables.length > 0) {
        cssVariables.push(`${yfmSelector} {`);
        cssVariables.push(...yfmCssVariables);
        cssVariables.push('}');
    }

    cssVariables.push('\n');
    return cssVariables.join('\n');
}
