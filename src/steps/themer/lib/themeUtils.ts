import {capitalize, cloneDeep, lowerCase} from 'lodash';
import {PaletteTokens, PrivateColors, ThemeOptions, ThemeState, ThemeVariant} from '../models';
import {generatePrivateColors} from './privateColors';

function createTitleFromToken(token: string) {
    return capitalize(lowerCase(token));
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

    // console.log('createPalleteTokens palette', palette);
    // console.log('createPalleteTokens tokens', tokens);

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

export function initThemeCreator(inputTheme: ThemeOptions): ThemeState {
    const theme = cloneDeep(inputTheme);
    const paletteTokens = createPalleteTokens(theme);

    // TODO: оставить только нужные поля
    return {
        ...theme,
        paletteTokens,
        tokens: Object.keys(paletteTokens),
        // showMainSettings: false,
        // advancedModeEnabled: false,
        // changesExist: false,
    };
}
