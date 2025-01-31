import {JSONSchemaType} from 'ajv';
import {ThemeConfig} from './types';
import Ajv, {FormatDefinition} from 'ajv';
import chroma from 'chroma-js';

const themeProperties = {
    type: 'object',
    properties: {
        'base-brand': {type: 'string', nullable: true, format: 'color'},
        'base-brand-hover': {type: 'string', nullable: true, format: 'color'},
        'base-selection': {type: 'string', nullable: true, format: 'color'},
        'base-selection-hover': {type: 'string', nullable: true, format: 'color'},
        'text-link': {type: 'string', nullable: true, format: 'color'},
        'text-link-hover': {type: 'string', nullable: true, format: 'color'},
        'text-brand': {type: 'string', nullable: true, format: 'color'},
        'text-brand-heavy': {type: 'string', nullable: true, format: 'color'},
        'line-brand': {type: 'string', nullable: true, format: 'color'},
        'base-background': {type: 'string', nullable: true, format: 'color'},
        'base-misc-light': {type: 'string', nullable: true, format: 'color'},
        'line-generic': {type: 'string', nullable: true, format: 'color'},
        'base-generic': {type: 'string', nullable: true, format: 'color'},
        'base-generic-hover': {type: 'string', nullable: true, format: 'color'},
        'note-info-background': {type: 'string', nullable: true, format: 'color'},
        'note-tip-background': {type: 'string', nullable: true, format: 'color'},
        'note-warning-background': {type: 'string', nullable: true, format: 'color'},
        'note-important-background': {type: 'string', nullable: true, format: 'color'},
        'text-primary': {type: 'string', nullable: true, format: 'color'},
        'text-secondary': {type: 'string', nullable: true, format: 'color'},
        'text-complementary': {type: 'string', nullable: true, format: 'color'},
        'text-hint': {type: 'string', nullable: true, format: 'color'},
        'text-misc': {type: 'string', nullable: true, format: 'color'},
    },
    minProperties: 1,
    additionalProperties: false,
} as const;

const themeSchema: JSONSchemaType<ThemeConfig> = {
    type: 'object',
    properties: {
        light: themeProperties,
        dark: themeProperties,
    },
    required: ['light', 'dark'],
    additionalProperties: false,
};

const colorFormat: FormatDefinition<string> = {
    type: 'string',
    validate: (colorString: string) => {
        return chroma.valid(colorString);
    },
};

export function getThemeValidator() {
    const ajv = new Ajv();
    ajv.addFormat('color', colorFormat);
    return ajv.compile(themeSchema);
}
