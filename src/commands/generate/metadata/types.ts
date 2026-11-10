import type frontmatterSchema from '@diplodoc/ajv/json/frontmatter-schema.json';
import type {BaseArgs, BaseConfig} from '~/core/program';
import type {LLMClientConfig, LLMProvider} from '~/commands/translate/providers/ai/clients/types';

export type MetadataField = keyof typeof frontmatterSchema.properties;
export type MetadataMode = 'missing' | 'overwrite';
export type MetadataProvider = LLMProvider;

export type MetadataSettings = {
    input: AbsolutePath;
    fields: MetadataField[];
    mode: MetadataMode;
    provider: MetadataProvider;
    model?: string;
};

export type MetadataConfig = BaseConfig &
    MetadataSettings &
    Partial<LLMClientConfig> & {
        skipInteractive?: boolean;
        retry?: number;
        rateLimitRetry?: number;
        maxOutputTokens?: number;
    };

export type MetadataArgs = BaseArgs & Partial<MetadataConfig> & {apiHeader?: string[]};
