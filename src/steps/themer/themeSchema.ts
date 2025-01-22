import {JSONSchemaType} from 'ajv';
import {ThemeConfig} from './types';

export const themeSchema: JSONSchemaType<ThemeConfig> = {
    type: 'object',
    properties: {
        light: {
            type: 'object',
            properties: {
                'base-brand': {type: 'string', format: 'color'},
                'base-background': {type: 'string', nullable: true, format: 'color'},
                'base-selection': {type: 'string', nullable: true, format: 'color'},
                'brand-hover': {type: 'string', nullable: true, format: 'color'},
            },
            required: ['base-brand'],
            additionalProperties: false,
        },
        dark: {
            type: 'object',
            properties: {
                'base-brand': {type: 'string', format: 'color'},
                'base-background': {type: 'string', nullable: true, format: 'color'},
                'base-selection': {type: 'string', nullable: true, format: 'color'},
                'brand-hover': {type: 'string', nullable: true, format: 'color'},
            },
            required: ['base-brand'],
            additionalProperties: false,
        },
    },
    required: ['light', 'dark'],
    additionalProperties: false,
};
