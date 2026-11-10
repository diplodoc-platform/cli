import type {LLMClient, LLMClientConfig, LLMProvider} from './types';

import {ok} from 'node:assert';

import {AnthropicClient} from './anthropic';
import {createOpenAIClient, createOpenRouterClient} from './openai';
import {YandexGptClient} from './yandexgpt';

export const PROVIDER_NAMES = ['yandexgpt', 'openai', 'openrouter', 'anthropic'] as const;

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
    yandexgpt: 'yandexgpt-lite',
    openai: 'gpt-4o-mini',
    openrouter: 'openai/gpt-4o-mini',
    anthropic: 'claude-sonnet-4-5',
};

export const ENV_AUTH: Record<LLMProvider, string[]> = {
    yandexgpt: ['YANDEX_API_KEY', 'YC_IAM_TOKEN'],
    openai: ['OPENAI_API_KEY'],
    openrouter: ['OPENROUTER_API_KEY'],
    anthropic: ['ANTHROPIC_API_KEY'],
};

export const ENV_BASE_URL: Record<LLMProvider, string[]> = {
    yandexgpt: [],
    openai: ['OPENAI_BASE_URL'],
    openrouter: ['OPENROUTER_BASE_URL'],
    anthropic: ['ANTHROPIC_BASE_URL'],
};

export const AUTH_HEADER: Record<LLMProvider, string> = {
    yandexgpt: 'authorization',
    openai: 'authorization',
    openrouter: 'authorization',
    anthropic: 'x-api-key',
};

export function readEnv(names: string[]): string | undefined {
    return names.map((name) => process.env[name]).find(Boolean);
}

export function parseHeaders(value: unknown): Record<string, string> {
    if (!value) {
        return {};
    }

    if (Array.isArray(value)) {
        const headers: Record<string, string> = {};

        for (const entry of value) {
            const text = String(entry);
            const separator = text.indexOf(':');
            ok(separator > 0, `Invalid api header "${entry}". Expected "Name: value" format.`);
            headers[text.slice(0, separator).trim()] = text.slice(separator + 1).trim();
        }

        return headers;
    }

    if (typeof value === 'object') {
        return {...(value as Record<string, string>)};
    }

    return parseHeaders([value]);
}

export function createClient(provider: LLMProvider, config: LLMClientConfig): LLMClient {
    const common = {
        token: config.auth,
        model: config.model,
        baseUrl: config.apiBase,
        timeout: config.timeout,
        headers: config.apiHeaders,
    };

    switch (provider) {
        case 'yandexgpt':
            return new YandexGptClient({...common, folder: config.folder});
        case 'openai':
            return createOpenAIClient(common);
        case 'openrouter':
            return createOpenRouterClient(common);
        case 'anthropic':
            return new AnthropicClient(common);
    }
}
