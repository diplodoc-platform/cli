import type {ChatMessage, CompletionOptions, CompletionResult, LLMClient} from './types';

import axios from 'axios';

import {LLMResponseError, isTemperatureRejected, throwLLMError} from '../utils';

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
    token?: string;
    model: string;
    baseUrl?: string;
    timeout?: number;
    headers?: Record<string, string>;
};

export class AnthropicClient implements LLMClient {
    readonly name = 'anthropic';

    /** Set after the API refused `temperature`; it is not sent any more. */
    temperatureDropped = false;

    private readonly token?: string;
    private readonly model: string;
    private readonly baseUrl: string;
    private readonly timeout: number;
    private readonly headers: Record<string, string>;

    constructor(options: AnthropicClientOptions) {
        this.token = options.token;
        this.model = options.model;
        this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
        this.timeout = options.timeout ?? 60_000;
        this.headers = options.headers || {};
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
                throwLLMError(error, 'Anthropic');
            }

            this.temperatureDropped = true;
        }

        try {
            return await this.send(messages, options, false);
        } catch (error) {
            throwLLMError(error, 'Anthropic');
        }
    }

    private async send(
        messages: ChatMessage[],
        options: CompletionOptions,
        withTemperature: boolean,
    ): Promise<CompletionResult> {
        const system = messages
            .filter((m) => m.role === 'system')
            .map((m) => m.content)
            .join('\n\n');
        const conversation = messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({role: m.role, content: m.content}));

        const {data} = await axios.post<AnthropicMessagesResponse>(
            `${this.baseUrl}/messages`,
            {
                model: this.model,
                system: system || undefined,
                messages: conversation,
                ...(withTemperature ? {temperature: options.temperature} : {}),
                max_tokens: options.maxTokens,
            },
            {
                timeout: this.timeout,
                headers: {
                    ...(this.token ? {'x-api-key': this.token} : {}),
                    'anthropic-version': ANTHROPIC_VERSION,
                    'Content-Type': 'application/json',
                    'User-Agent': 'github.com/diplodoc-platform/cli',
                    ...this.headers,
                },
            },
        );

        if (data.stop_reason === 'max_tokens') {
            throw new LLMResponseError(
                'Anthropic response was truncated (stop_reason=max_tokens). ' +
                    'Increase --max-output-tokens or reduce --max-batch-tokens.',
                false,
            );
        }

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
    }
}
