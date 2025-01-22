import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {Run} from '~/commands/build';
import {THEME_CONFIG_FILENAME} from '~/constants';
import * as yaml from 'js-yaml';
import chroma from 'chroma-js';
import {property} from 'lodash';
import Ajv, {FormatDefinition, JSONSchemaType} from 'ajv';
import {ThemeConfig, themeSchema} from './themer';

const colorFormat: FormatDefinition<string> = {
    type: 'string',
    validate: (colorString: string) => {
        return chroma.valid(colorString);
    },
};

async function loadFile(folderPath: AbsolutePath) {
    const themePath = resolve(folderPath, THEME_CONFIG_FILENAME);
    const content = (await readFile(themePath, 'utf8')) || '{}';
    return yaml.load(content);
}

export async function processThemer(run: Run) {
    const ajv = new Ajv();
    ajv.addFormat('color', colorFormat);
    const validate = ajv.compile(themeSchema);

    try {
        const configRaw = await loadFile(run.input);
        if (validate(configRaw)) {
            createTheme(configRaw as ThemeConfig);
        } else {
            throw Error('Validation error');
        }
    } catch (e) {
        console.log('ThemeError');
        console.log(e);
    }
}

function createTheme(configData: ThemeConfig) {
    console.log(configData);
}
