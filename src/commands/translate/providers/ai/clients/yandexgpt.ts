import type {ChatMessage, CompletionOptions, CompletionResult, LLMClient} from './types';

import axios from 'axios';

import {LLMResponseError, throwLLMError} from '../utils';
import {yandexAuthHeader} from '../auth';

const DEFAULT_BASE_URL = 'https://llm.api.cloud.yandex.net';
const COMPLETION_PATH = '/foundationModels/v1/completion';

type YandexMessage = {
    role: 'system' | 'user' | 'assistant';
    text: string;
};

type YandexCompletionResponse = {
    result: {
        alternatives: {
            message: {role: string; text: string};
            status: string;
        }[];
        usage?: {
            inputTextTokens?: string | number;
            completionTokens?: string | number;
            totalTokens?: string | number;
        };
        modelVersion?: string;
    };
};

export type YandexGptClientOptions = {
    token: string;
    model: string;
    folder?: string;
    baseUrl?: string;
    timeout?: number;
    headers?: Record<string, string>;
};

/**
 * Resolves a `gpt://` URI for Yandex AI Studio.
 * Accepts either a short model name (e.g. `yandexgpt-lite`, folder taken from options)
 * or a fully qualified URI (e.g. `gpt://b1g.../yandexgpt-lite/latest`).
 */
function resolveModelUri(model: string, folder: string): string {
    if (model.startsWith('gpt://') || model.startsWith('ds://')) {
        return model;
    }

    if (!folder) {
        throw new Error(
            `Yandex AI Studio: --folder is required when --model is a short name (got "${model}")`,
        );
    }

    const parts = model.split('/');
    if (parts.length === 1) {
        return `gpt://${folder}/${model}/latest`;
    }

    return `gpt://${folder}/${model}`;
}

export class YandexGptClient implements LLMClient {
    readonly name = 'yandexgpt';

    private readonly token: string;
    private readonly folder: string;
    private readonly model: string;
    private readonly endpoint: string;
    private readonly timeout: number;
    private readonly headers: Record<string, string>;

    constructor(options: YandexGptClientOptions) {
        this.token = options.token;
        this.folder = options.folder || '';
        this.model = options.model;
        this.endpoint = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '') + COMPLETION_PATH;
        this.timeout = options.timeout ?? 60_000;
        this.headers = options.headers || {};
    }

    async complete(messages: ChatMessage[], options: CompletionOptions): Promise<CompletionResult> {
        const yandexMessages: YandexMessage[] = messages.map((m) => ({
            role: m.role,
            text: m.content,
        }));

        try {
            const {data} = await axios.post<YandexCompletionResponse>(
                this.endpoint,
                {
                    modelUri: resolveModelUri(this.model, this.folder),
                    completionOptions: {
                        stream: false,
                        temperature: options.temperature,
                        maxTokens: String(options.maxTokens),
                    },
                    messages: yandexMessages,
                },
                {
                    timeout: this.timeout,
                    headers: {
                        Authorization: yandexAuthHeader(this.token),
                        'Content-Type': 'application/json',
                        'User-Agent': 'github.com/diplodoc-platform/cli',
                        ...this.headers,
                    },
                },
            );

            const alternative = data.result.alternatives?.[0];
            if (!alternative) {
                throw new LLMResponseError('Yandex AI Studio returned no alternatives');
            }

            if (alternative.status === 'ALTERNATIVE_STATUS_CONTENT_FILTER') {
                throw new LLMResponseError(
                    'Yandex AI Studio rejected the request (content filter)',
                    false,
                );
            }

            if (alternative.status === 'ALTERNATIVE_STATUS_TRUNCATED_FINAL') {
                throw new LLMResponseError(
                    'Yandex AI Studio response was truncated. ' +
                        'Increase --max-output-tokens or reduce --max-batch-tokens.',
                    false,
                );
            }

            return {
                text: alternative.message.text,
                usage: {
                    inputTokens: Number(data.result.usage?.inputTextTokens ?? 0),
                    outputTokens: Number(data.result.usage?.completionTokens ?? 0),
                },
            };
        } catch (error) {
            throwLLMError(error, 'Yandex AI Studio');
        }
    }
}
