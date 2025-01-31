import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {THEME_CONFIG_FILENAME} from '~/constants';
import * as yaml from 'js-yaml';
import chroma from 'chroma-js';
import {COLOR_MAP, PRIVATE_SOLID_VARIABLES, PRIVATE_VARIABLES} from './constants';

export async function loadFile(folderPath: AbsolutePath) {
    const themePath = resolve(folderPath, THEME_CONFIG_FILENAME);
    const content = (await readFile(themePath, 'utf8')) || '{}';
    return yaml.load(content);
}

export const generateBrandShades = ({
    colorValue,
    lightBg,
    darkBg,
}: {
    colorValue: string;
    lightBg: string;
    darkBg: string;
}) => {
    const privateColors: Record<string, string> = {};

    if (!chroma.valid(colorValue)) {
        throw Error('Not valid color for chroma');
    }

    let colorsMapInternal = COLOR_MAP;

    const pallete = Object.entries(colorsMapInternal).reduce(
        (res, [key, {a, c}]) => {
            const solidColor = chroma.mix(colorValue, c > 0 ? darkBg : lightBg, 1 - a, 'rgb').css();

            const alphaColor = chroma(colorValue).alpha(a).css();

            res[key] = [solidColor, alphaColor];

            return res;
        },
        {} as Record<string, [string, string]>,
    );

    // Set 550 Solid Color
    privateColors[`550-solid`] = chroma(colorValue).css();

    // Set 50-1000 Solid Colors, except 550 Solid Color
    PRIVATE_SOLID_VARIABLES.forEach((varName) => {
        privateColors[`${varName}-solid`] = chroma(pallete[varName][0]).css();
    });

    // Set 50-500 Colors
    PRIVATE_VARIABLES.forEach((varName) => {
        privateColors[`${varName}`] = chroma(pallete[varName][1]).css();
    });

    return privateColors;
};
