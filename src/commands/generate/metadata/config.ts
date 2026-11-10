import type {MetadataField} from './types';

import {ok} from 'node:assert';
import {resolve} from 'node:path';
import {frontmatterSchemaJson} from '@diplodoc/ajv';

import {option} from '~/core/config';
import {PROVIDER_NAMES} from '~/commands/translate/providers/ai/clients';
import {options as aiOptions} from '~/commands/translate/providers/ai/config';

export const FIELDS = Object.keys(frontmatterSchemaJson.properties as object) as MetadataField[];
export const MODES = ['missing', 'overwrite'] as const;
export const PROVIDERS = PROVIDER_NAMES;

export function resolveFields(value: unknown): MetadataField[] {
    const fields =
        typeof value === 'string' ? value.split(',').map((field) => field.trim()) : value;

    if (fields === undefined) {
        return [...FIELDS];
    }

    ok(
        Array.isArray(fields) &&
            fields.length > 0 &&
            fields.every((field) => FIELDS.includes(field)),
        `Select metadata fields from: ${FIELDS.join(', ')}.`,
    );

    return [...new Set<MetadataField>(fields)];
}

export const options = {
    auth: aiOptions.auth,
    folder: aiOptions.folder,
    apiBase: aiOptions.apiBase,
    apiHeader: aiOptions.apiHeader,
    retry: aiOptions.retry,
    rateLimitRetry: aiOptions.rateLimitRetry,
    maxOutputTokens: aiOptions.maxOutputTokens,
    timeout: option({
        flags: '--timeout <ms>',
        desc: 'AI request timeout in milliseconds.',
        parser: Number,
        defaultInfo: 60000,
    }),
    input: option({
        flags: '-i, --input <path>',
        desc: 'Path to a documentation file or directory.',
        parser: (value: string) => resolve(value),
    }),
    fields: option({
        flags: '--fields <list>',
        desc: 'Comma-separated metadata fields. Selects all fields when omitted.',
        parser: resolveFields,
    }),
    mode: option({
        flags: '--mode <mode>',
        desc: 'Fill missing fields or overwrite the selected fields.',
        choices: [...MODES],
        defaultInfo: 'missing',
    }),
    provider: option({
        flags: '--provider <provider>',
        desc: 'AI provider to use for metadata generation.',
        choices: [...PROVIDERS],
        defaultInfo: 'yandexgpt',
    }),
    model: option({
        flags: '--model <name>',
        desc: 'Model name. Leave unset to use the provider default.',
    }),
    skipInteractive: option({
        flags: '--skip-interactive',
        desc: 'Skip the interactive wizard and use flags and configuration.',
    }),
};
