import chroma from 'chroma-js';

import {themeXd} from './constants';

const privateSolidVariables = [
    1000, 950, 900, 850, 800, 750, 700, 650, 600, 500, 450, 400, 350, 300, 250, 200, 150, 100, 50,
];
const privateVariables = [500, 450, 400, 350, 300, 250, 200, 150, 100, 50];
const colorsMap = {
    50: {a: 0.1, c: -1},
    100: {a: 0.15, c: -1},
    150: {a: 0.2, c: -1},
    200: {a: 0.3, c: -1},
    250: {a: 0.4, c: -1},
    300: {a: 0.5, c: -1},
    350: {a: 0.6, c: -1},
    400: {a: 0.7, c: -1},
    450: {a: 0.8, c: -1},
    500: {a: 0.9, c: -1},
    550: {a: 1, c: 1},
    600: {a: 0.9, c: 1},
    650: {a: 0.8, c: 1},
    700: {a: 0.7, c: 1},
    750: {a: 0.6, c: 1},
    800: {a: 0.5, c: 1},
    850: {a: 0.4, c: 1},
    900: {a: 0.3, c: 1},
    950: {a: 0.2, c: 1},
    1000: {a: 0.15, c: 1},
};

type Theme = 'light' | 'dark';

type GeneratePrivateColorsArgs = {
    theme: Theme;
    colorToken: string;
    colorValue: string;
    lightBg: string;
    darkBg: string;
};

export const generatePrivateColors = ({
    theme,
    colorToken,
    colorValue,
    lightBg,
    darkBg,
}: GeneratePrivateColorsArgs) => {
    const privateColors: Record<string, string> = {};

    if (!chroma.valid(colorValue)) {
        throw Error('Not valid color for chroma');
    }

    let colorsMapInternal = colorsMap;

    if (colorToken === 'white' || colorToken === 'black') {
        colorsMapInternal = themeXd[theme][colorToken].colorsMap;
    }

    const pallete = Object.entries(colorsMapInternal).reduce((res, [key, {a, c}]) => {
        const solidColor = chroma.mix(colorValue, c > 0 ? darkBg : lightBg, 1 - a, 'rgb').css();

        const alphaColor = chroma(colorValue).alpha(a).css();

        res[key] = [solidColor, alphaColor];

        return res;
    }, {} as Record<string, [string, string]>);

    let privateSolidVariablesInternal = privateSolidVariables;
    let privateVariablesInternal = privateVariables;

    if (colorToken === 'white' || colorToken === 'black') {
        privateSolidVariablesInternal = themeXd[theme][colorToken].privateSolidVariables;
        privateVariablesInternal = themeXd[theme][colorToken].privateVariables;
    }

    // Set 550 Solid Color
    privateColors['550-solid'] = chroma(colorValue).css();

    // Set 50-1000 Solid Colors, except 550 Solid Color
    privateSolidVariablesInternal.forEach((varName) => {
        privateColors[`${varName}-solid`] = chroma(pallete[varName][0]).css();
    });

    // Set 50-500 Colors
    privateVariablesInternal.forEach((varName) => {
        privateColors[`${varName}`] = chroma(pallete[varName][1]).css();
    });

    if (theme === 'dark' && colorToken === 'white') {
        const updatedColor = chroma(pallete[150][0]).alpha(0.95).css();
        privateColors['opaque-150'] = chroma(updatedColor).css();
    }

    return privateColors;
};
