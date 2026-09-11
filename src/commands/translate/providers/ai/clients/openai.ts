import type {ChatMessage, CompletionOptions, CompletionResult, LLMClient} from './types';

import axios from 'axios';

import {LLMResponseError, isTemperatureRejected, throwLLMError} from '../utils';

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
    token?: string;
    model: string;
    baseUrl?: string;
    timeout?: number;
    headers?: Record<string, string>;
    name?: string;
    // OpenAI deprecated max_tokens in favor of max_completion_tokens,
    // but most compatible gateways still expect max_tokens.
    tokenParam?: 'max_tokens' | 'max_completion_tokens';
};

export class OpenAICompatibleClient implements LLMClient {
    readonly name: string;

    /** Set after the API refused `temperature`; it is not sent any more. */
    temperatureDropped = false;

    private readonly token?: string;
    private readonly model: string;
    private readonly baseUrl: string;
    private readonly timeout: number;
    private readonly headers: Record<string, string>;
    private readonly tokenParam: 'max_tokens' | 'max_completion_tokens';

    constructor(options: OpenAICompatibleClientOptions) {
        this.name = options.name || 'openai';
        this.token = options.token;
        this.model = options.model;
        this.baseUrl = (options.baseUrl || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, '');
        this.timeout = options.timeout ?? 60_000;
        this.headers = options.headers || {};
        this.tokenParam = options.tokenParam || 'max_tokens';
    }

    /**
     * The newest models accept only their default temperature and answer with
     * a bad request. The first such answer drops the parameter for the rest of
     * the run and the request is repeated.
     */
    async complete(messages: ChatMessage[], options: CompletionOptions): Promise<CompletionResult> {
        // Concurrent requests can race into the same rejection, so the
        // decision to retry follows what THIS request sent, not the flag.
        const withTemperature = !this.temperatureDropped;

        try {
            return await this.send(messages, options, withTemperature);
        } catch (error) {
            if (!withTemperature || !isTemperatureRejected(error)) {
                throwLLMError(error, this.name);
            }

            this.temperatureDropped = true;
        }

        try {
            return await this.send(messages, options, false);
        } catch (error) {
            throwLLMError(error, this.name);
        }
    }

    private async send(
        messages: ChatMessage[],
        options: CompletionOptions,
        withTemperature: boolean,
    ): Promise<CompletionResult> {
        const {data} = await axios.post<OpenAIChatResponse>(
            `${this.baseUrl}/chat/completions`,
            {
                model: this.model,
                messages: messages.map((m) => ({role: m.role, content: m.content})),
                ...(withTemperature && options.temperature !== undefined
                    ? {temperature: options.temperature}
                    : {}),
                [this.tokenParam]: options.maxTokens,
            },
            {
                timeout: this.timeout,
                headers: {
                    ...(this.token ? {Authorization: `Bearer ${this.token}`} : {}),
                    'Content-Type': 'application/json',
                    'User-Agent': 'github.com/diplodoc-platform/cli',
                    ...this.headers,
                },
            },
        );

        const choice = data.choices?.[0];

        if (choice?.finish_reason === 'length') {
            throw new LLMResponseError(
                `${this.name} response was truncated (finish_reason=length). ` +
                    'Increase --max-output-tokens or reduce --max-batch-tokens.',
                false,
            );
        }

        const text = choice?.message?.content;
        if (!text) {
            throw new LLMResponseError(`${this.name} returned an empty response`);
        }

        return {
            text,
            usage: {
                inputTokens: data.usage?.prompt_tokens ?? 0,
                outputTokens: data.usage?.completion_tokens ?? 0,
            },
        };
    }
}

export function createOpenAIClient(
    opts: Omit<OpenAICompatibleClientOptions, 'name' | 'tokenParam'>,
) {
    return new OpenAICompatibleClient({
        ...opts,
        name: 'openai',
        baseUrl: opts.baseUrl || DEFAULT_OPENAI_BASE_URL,
        tokenParam: 'max_completion_tokens',
    });
}

export function createOpenRouterClient(
    opts: Omit<OpenAICompatibleClientOptions, 'name' | 'tokenParam'>,
) {
    return new OpenAICompatibleClient({
        ...opts,
        name: 'openrouter',
        baseUrl: opts.baseUrl || DEFAULT_OPENROUTER_BASE_URL,
        headers: {
            'HTTP-Referer': 'https://github.com/diplodoc-platform/cli',
            'X-Title': 'Diplodoc CLI',
            ...opts.headers,
        },
    });
}
