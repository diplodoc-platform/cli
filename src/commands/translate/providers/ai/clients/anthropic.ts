import type {ChatMessage, CompletionOptions, CompletionResult, LLMClient} from './types';

import axios, {AxiosError} from 'axios';

import {LLMAuthError, LLMRateLimitError, LLMRequestError, LLMResponseError} from '../utils';

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

type AnthropicMessagesResponse = {
    content: {type: string; text?: string}[];
    stop_reason: string;
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
    };
};

export type AnthropicClientOptions = {
    token: string;
    model: string;
    baseUrl?: string;
    timeout?: number;
};

export class AnthropicClient implements LLMClient {
    readonly name = 'anthropic';

    private readonly token: string;
    private readonly model: string;
    private readonly baseUrl: string;
    private readonly timeout: number;

    constructor(options: AnthropicClientOptions) {
        this.token = options.token;
        this.model = options.model;
        this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
        this.timeout = options.timeout ?? 60_000;
    }

    async complete(
        messages: ChatMessage[],
        options: CompletionOptions,
    ): Promise<CompletionResult> {
        const system = messages
            .filter((m) => m.role === 'system')
            .map((m) => m.content)
            .join('\n\n');
        const conversation = messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({role: m.role, content: m.content}));

        try {
            const {data} = await axios.post<AnthropicMessagesResponse>(
                `${this.baseUrl}/messages`,
                {
                    model: this.model,
                    system: system || undefined,
                    messages: conversation,
                    temperature: options.temperature,
                    max_tokens: options.maxTokens,
                },
                {
                    timeout: this.timeout,
                    headers: {
                        'x-api-key': this.token,
                        'anthropic-version': ANTHROPIC_VERSION,
                        'Content-Type': 'application/json',
                        'User-Agent': 'github.com/diplodoc-platform/cli',
                    },
                },
            );

            const text = data.content
                .filter((block) => block.type === 'text' && block.text)
                .map((block) => block.text as string)
                .join('');

            if (!text) {
                throw new LLMResponseError('Anthropic returned an empty response');
            }

            return {
                text,
                usage: {
                    inputTokens: data.usage?.input_tokens ?? 0,
                    outputTokens: data.usage?.output_tokens ?? 0,
                },
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            if (error instanceof AxiosError && error.response) {
                const {status, statusText, data} = error.response;
                const message = data?.error?.message || data?.message || statusText;

                if (status === 401 || status === 403) {
                    throw new LLMAuthError(`Anthropic auth failed: ${message}`);
                }
                if (status === 429) {
                    throw new LLMRateLimitError(message);
                }
                throw new LLMRequestError(status, message, {
                    retryable: status >= 500 && status < 600,
                });
            }
            throw error;
        }
    }
}
