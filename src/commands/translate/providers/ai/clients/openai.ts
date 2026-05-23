import type {ChatMessage, CompletionOptions, CompletionResult, LLMClient} from './types';

import axios, {AxiosError} from 'axios';

import {LLMAuthError, LLMRateLimitError, LLMRequestError, LLMResponseError} from '../utils';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

type OpenAIChatResponse = {
    choices: {
        message: {role: string; content: string};
        finish_reason: string;
    }[];
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
};

export type OpenAICompatibleClientOptions = {
    token: string;
    model: string;
    baseUrl?: string;
    timeout?: number;
    extraHeaders?: Record<string, string>;
    name?: string;
};

export class OpenAICompatibleClient implements LLMClient {
    readonly name: string;

    private readonly token: string;
    private readonly model: string;
    private readonly baseUrl: string;
    private readonly timeout: number;
    private readonly extraHeaders: Record<string, string>;

    constructor(options: OpenAICompatibleClientOptions) {
        this.name = options.name || 'openai';
        this.token = options.token;
        this.model = options.model;
        this.baseUrl = (options.baseUrl || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, '');
        this.timeout = options.timeout ?? 60_000;
        this.extraHeaders = options.extraHeaders || {};
    }

    async complete(
        messages: ChatMessage[],
        options: CompletionOptions,
    ): Promise<CompletionResult> {
        try {
            const {data} = await axios.post<OpenAIChatResponse>(
                `${this.baseUrl}/chat/completions`,
                {
                    model: this.model,
                    messages: messages.map((m) => ({role: m.role, content: m.content})),
                    temperature: options.temperature,
                    max_tokens: options.maxTokens,
                },
                {
                    timeout: this.timeout,
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'github.com/diplodoc-platform/cli',
                        ...this.extraHeaders,
                    },
                },
            );

            const choice = data.choices?.[0];
            if (!choice) {
                throw new LLMResponseError(`${this.name} returned no choices`);
            }

            return {
                text: choice.message.content,
                usage: {
                    inputTokens: data.usage?.prompt_tokens ?? 0,
                    outputTokens: data.usage?.completion_tokens ?? 0,
                },
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            if (error instanceof AxiosError && error.response) {
                const {status, statusText, data} = error.response;
                const message = data?.error?.message || data?.message || statusText;

                if (status === 401 || status === 403) {
                    throw new LLMAuthError(`${this.name} auth failed: ${message}`);
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

export function createOpenAIClient(opts: Omit<OpenAICompatibleClientOptions, 'name' | 'baseUrl'> & {
    baseUrl?: string;
}) {
    return new OpenAICompatibleClient({
        ...opts,
        name: 'openai',
        baseUrl: opts.baseUrl || DEFAULT_OPENAI_BASE_URL,
    });
}

export function createOpenRouterClient(
    opts: Omit<OpenAICompatibleClientOptions, 'name' | 'baseUrl'> & {baseUrl?: string},
) {
    return new OpenAICompatibleClient({
        ...opts,
        name: 'openrouter',
        baseUrl: opts.baseUrl || DEFAULT_OPENROUTER_BASE_URL,
        extraHeaders: {
            'HTTP-Referer': 'https://github.com/diplodoc-platform/cli',
            'X-Title': 'Diplodoc CLI',
            ...(opts.extraHeaders || {}),
        },
    });
}
