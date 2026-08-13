import type {Mock} from 'vitest';

import {beforeEach, describe, expect, it, vi} from 'vitest';
import axios from 'axios';

import {LLMResponseError} from '../utils';

import {AnthropicClient} from './anthropic';
import {createOpenAIClient, createOpenRouterClient} from './openai';
import {YandexGptClient} from './yandexgpt';

vi.mock('axios', async (importOriginal) => {
    const actual = (await importOriginal()) as {default: object};

    return {
        ...actual,
        default: {
            ...actual.default,
            post: vi.fn(),
        },
    };
});

const post = axios.post as Mock;

const messages = [
    {role: 'system' as const, content: 'system'},
    {role: 'user' as const, content: 'user'},
];

const completionOptions = {temperature: 0, maxTokens: 100};

describe('translate ai clients', () => {
    beforeEach(() => {
        post.mockReset();
    });

    describe('openai', () => {
        const response = {
            choices: [{message: {role: 'assistant', content: 'result'}, finish_reason: 'stop'}],
            usage: {prompt_tokens: 10, completion_tokens: 20},
        };

        it('should request chat completions with max_completion_tokens', async () => {
            post.mockResolvedValueOnce({data: response});

            const client = createOpenAIClient({token: 't', model: 'gpt-4o-mini'});
            const result = await client.complete(messages, completionOptions);

            expect(result.text).toBe('result');
            expect(result.usage).toEqual({inputTokens: 10, outputTokens: 20});

            const [url, payload] = post.mock.calls[0];
            expect(url).toBe('https://api.openai.com/v1/chat/completions');
            expect(payload.max_completion_tokens).toBe(100);
            expect(payload.max_tokens).toBeUndefined();
        });

        it('should respect custom base url and headers', async () => {
            post.mockResolvedValueOnce({data: response});

            const client = createOpenAIClient({
                token: 't',
                model: 'internal-model',
                baseUrl: 'https://llm.internal/v1/',
                headers: {'X-Org': 'team'},
            });
            await client.complete(messages, completionOptions);

            const [url, , config] = post.mock.calls[0];
            expect(url).toBe('https://llm.internal/v1/chat/completions');
            expect(config.headers['X-Org']).toBe('team');
            expect(config.headers.Authorization).toBe('Bearer t');
        });

        it('should not send default Authorization when token is absent', async () => {
            post.mockResolvedValueOnce({data: response});

            const client = createOpenAIClient({
                model: 'internal-model',
                baseUrl: 'https://llm.internal/v1',
                headers: {Authorization: 'OAuth secret'},
            });
            await client.complete(messages, completionOptions);

            const [, , config] = post.mock.calls[0];
            expect(config.headers.Authorization).toBe('OAuth secret');
        });

        it('should throw on truncated response', async () => {
            post.mockResolvedValueOnce({
                data: {
                    choices: [
                        {message: {role: 'assistant', content: 'part'}, finish_reason: 'length'},
                    ],
                },
            });

            const client = createOpenAIClient({token: 't', model: 'gpt-4o-mini'});

            await expect(client.complete(messages, completionOptions)).rejects.toThrow(
                LLMResponseError,
            );
        });

        it('should throw on empty response', async () => {
            post.mockResolvedValueOnce({data: {choices: []}});

            const client = createOpenAIClient({token: 't', model: 'gpt-4o-mini'});

            await expect(client.complete(messages, completionOptions)).rejects.toThrow(
                'empty response',
            );
        });
    });

    describe('openrouter', () => {
        it('should keep max_tokens for compatible gateways', async () => {
            post.mockResolvedValueOnce({
                data: {
                    choices: [
                        {message: {role: 'assistant', content: 'result'}, finish_reason: 'stop'},
                    ],
                },
            });

            const client = createOpenRouterClient({token: 't', model: 'openai/gpt-4o-mini'});
            await client.complete(messages, completionOptions);

            const [url, payload, config] = post.mock.calls[0];
            expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
            expect(payload.max_tokens).toBe(100);
            expect(payload.max_completion_tokens).toBeUndefined();
            expect(config.headers['HTTP-Referer']).toBeDefined();
        });
    });

    describe('anthropic', () => {
        it('should join text blocks and pass system prompt separately', async () => {
            post.mockResolvedValueOnce({
                data: {
                    content: [
                        {type: 'text', text: 'One'},
                        {type: 'text', text: 'Two'},
                    ],
                    stop_reason: 'end_turn',
                    usage: {input_tokens: 5, output_tokens: 6},
                },
            });

            const client = new AnthropicClient({token: 't', model: 'claude-sonnet-4-5'});
            const result = await client.complete(messages, completionOptions);

            expect(result.text).toBe('OneTwo');

            const [url, payload, config] = post.mock.calls[0];
            expect(url).toBe('https://api.anthropic.com/v1/messages');
            expect(payload.system).toBe('system');
            expect(payload.messages).toEqual([{role: 'user', content: 'user'}]);
            expect(config.headers['x-api-key']).toBe('t');
        });

        it('should allow header overrides for internal gateways', async () => {
            post.mockResolvedValueOnce({
                data: {content: [{type: 'text', text: 'ok'}], stop_reason: 'end_turn'},
            });

            const client = new AnthropicClient({
                token: 't',
                model: 'claude-sonnet-4-5',
                baseUrl: 'https://llm.internal/v1',
                headers: {Authorization: 'OAuth session'},
            });
            await client.complete(messages, completionOptions);

            const [url, , config] = post.mock.calls[0];
            expect(url).toBe('https://llm.internal/v1/messages');
            expect(config.headers.Authorization).toBe('OAuth session');
        });

        it('should throw on truncated response', async () => {
            post.mockResolvedValueOnce({
                data: {content: [{type: 'text', text: 'part'}], stop_reason: 'max_tokens'},
            });

            const client = new AnthropicClient({token: 't', model: 'claude-sonnet-4-5'});

            await expect(client.complete(messages, completionOptions)).rejects.toThrow('truncated');
        });
    });

    describe('yandexgpt', () => {
        const response = {
            result: {
                alternatives: [
                    {
                        message: {role: 'assistant', text: 'result'},
                        status: 'ALTERNATIVE_STATUS_FINAL',
                    },
                ],
                usage: {inputTextTokens: '10', completionTokens: '20'},
            },
        };

        it('should post to the default completion endpoint', async () => {
            post.mockResolvedValueOnce({data: response});

            const client = new YandexGptClient({token: 'y0_t', model: 'yandexgpt', folder: 'b1g'});
            const result = await client.complete(messages, completionOptions);

            expect(result.text).toBe('result');
            expect(result.usage).toEqual({inputTokens: 10, outputTokens: 20});

            const [url, payload] = post.mock.calls[0];
            expect(url).toBe('https://llm.api.cloud.yandex.net/foundationModels/v1/completion');
            expect(payload.modelUri).toBe('gpt://b1g/yandexgpt/latest');
        });

        it('should append the completion path to a custom base url', async () => {
            post.mockResolvedValueOnce({data: response});

            const client = new YandexGptClient({
                token: 'y0_t',
                model: 'yandexgpt',
                folder: 'b1g',
                baseUrl: 'https://llm.internal/',
            });
            await client.complete(messages, completionOptions);

            const [url] = post.mock.calls[0];
            expect(url).toBe('https://llm.internal/foundationModels/v1/completion');
        });

        it('should throw on truncated response', async () => {
            post.mockResolvedValueOnce({
                data: {
                    result: {
                        alternatives: [
                            {
                                message: {role: 'assistant', text: 'part'},
                                status: 'ALTERNATIVE_STATUS_TRUNCATED_FINAL',
                            },
                        ],
                    },
                },
            });

            const client = new YandexGptClient({token: 'y0_t', model: 'yandexgpt', folder: 'b1g'});

            await expect(client.complete(messages, completionOptions)).rejects.toThrow('truncated');
        });

        it('should throw on content filter rejection', async () => {
            post.mockResolvedValueOnce({
                data: {
                    result: {
                        alternatives: [
                            {
                                message: {role: 'assistant', text: ''},
                                status: 'ALTERNATIVE_STATUS_CONTENT_FILTER',
                            },
                        ],
                    },
                },
            });

            const client = new YandexGptClient({token: 'y0_t', model: 'yandexgpt', folder: 'b1g'});

            await expect(client.complete(messages, completionOptions)).rejects.toThrow(
                'content filter',
            );
        });
    });
});
