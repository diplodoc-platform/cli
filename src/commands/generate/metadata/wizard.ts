import type {MetadataMode, MetadataProvider, MetadataSettings} from './types';

import {resolve} from 'node:path';
import {checkbox, input, select} from '@inquirer/prompts';

import {FIELDS, PROVIDERS} from './config';

export async function runWizard(defaults: MetadataSettings): Promise<MetadataSettings> {
    const source = await input({
        message: 'Documentation file or directory:',
        default: defaults.input,
        validate: (value) => Boolean(value.trim()) || 'Enter a file or directory path.',
    });

    const fields = await checkbox({
        message: 'Select metadata fields:',
        choices: FIELDS.map((field) => ({
            name: field,
            value: field,
            checked: defaults.fields.includes(field),
        })),
        validate: (chosen) => chosen.length > 0 || 'Select at least one field.',
    });

    const mode = await select<MetadataMode>({
        message: 'How should existing metadata be handled?',
        choices: [
            {name: 'Fill missing fields', value: 'missing'},
            {name: 'Overwrite selected fields', value: 'overwrite'},
        ],
        default: defaults.mode,
    });

    const provider = await select<MetadataProvider>({
        message: 'AI provider:',
        choices: PROVIDERS.map((value) => ({name: value, value})),
        default: defaults.provider,
    });

    const model = await input({
        message: 'Model (leave empty for the provider default):',
        default: defaults.model,
    });

    return {
        input: resolve(source.trim()) as AbsolutePath,
        fields,
        mode,
        provider,
        model: model.trim() || undefined,
    };
}
