import Ajv, {FormatDefinition, JSONSchemaType} from 'ajv';
import {ThemeConfig} from './types';
import chroma from 'chroma-js';

const colorsPropertiesSchema = {
    type: 'object',
    nullable: true,
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
        'text-primary': {type: 'string', nullable: true, format: 'color'},
        'text-secondary': {type: 'string', nullable: true, format: 'color'},
        'text-complementary': {type: 'string', nullable: true, format: 'color'},
        'text-hint': {type: 'string', nullable: true, format: 'color'},
        'text-misc': {type: 'string', nullable: true, format: 'color'},
        'note-info': {type: 'string', nullable: true, format: 'color'},
        'note-tip': {type: 'string', nullable: true, format: 'color'},
        'note-warning': {type: 'string', nullable: true, format: 'color'},
        'note-important': {type: 'string', nullable: true, format: 'color'},
        'note-info-background': {type: 'string', nullable: true, format: 'color'},
        'note-tip-background': {type: 'string', nullable: true, format: 'color'},
        'note-warning-background': {type: 'string', nullable: true, format: 'color'},
        'note-important-background': {type: 'string', nullable: true, format: 'color'},
        'note-info-border': {type: 'string', nullable: true, format: 'color'},
        'note-tip-border': {type: 'string', nullable: true, format: 'color'},
        'note-warning-border': {type: 'string', nullable: true, format: 'color'},
        'note-important-border': {type: 'string', nullable: true, format: 'color'},
        'quote': {type: 'string', nullable: true, format: 'color'},
        'tab': {type: 'string', nullable: true, format: 'color'},
        'tab-hover': {type: 'string', nullable: true, format: 'color'},
        'table': {type: 'string', nullable: true, format: 'color'},
        'table-background': {type: 'string', nullable: true, format: 'color'},
        'table-row-background': {type: 'string', nullable: true, format: 'color'},
        'table-outer-border': {type: 'string', nullable: true, format: 'color'},
        'table-inner-border': {type: 'string', nullable: true, format: 'color'},
        'code': {type: 'string', nullable: true, format: 'color'},
        'code-background': {type: 'string', nullable: true, format: 'color'},
        'inline-code': {type: 'string', nullable: true, format: 'color'},
        'inline-code-background': {type: 'string', nullable: true, format: 'color'},
        'mini-toc-border': {type: 'string', nullable: true, format: 'color'},
        'mini-toc': {type: 'string', nullable: true, format: 'color'},
        'mini-toc-hover': {type: 'string', nullable: true, format: 'color'},
        'mini-toc-active': {type: 'string', nullable: true, format: 'color'},
        'mini-toc-active-border': {type: 'string', nullable: true, format: 'color'},
    },
    required: [],
    additionalProperties: false,
    minProperties: 1,
} as const;

const themeSchema: JSONSchemaType<ThemeConfig> = {
    type: 'object',
    properties: {
        ...colorsPropertiesSchema.properties,
        light: colorsPropertiesSchema,
        dark: colorsPropertiesSchema,
    },
    required: [],
    additionalProperties: false,
    minProperties: 1,
} as const;

const colorFormat: FormatDefinition<string> = {
    type: 'string',
    validate: (colorString: string) => chroma.valid(colorString),
};

export function getThemeValidator() {
    const ajv = new Ajv();
    ajv.addFormat('color', colorFormat);
    return ajv.compile(themeSchema);
}
