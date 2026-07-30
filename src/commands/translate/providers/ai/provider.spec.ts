import type {Logger} from '~/core/logger';
import type {AITranslationConfig} from './index';
import type {LLMClient} from './clients/types';
import type {Defer} from './utils';

import {describe, expect, it, vi} from 'vitest';

import {makeTranslator} from './provider';
import {FRAGMENT_SEPARATOR, splitFragments} from './prompts';
import {LLMAuthError} from './utils';

type FakeComplete = (fragments: string[], call: number) => string[] | Error;

// The `{{fragments}}` user prompt makes the user message contain exactly
// the joined fragments, so the fake client can parse them back.
function makeClient(complete: FakeComplete) {
    let call = 0;

    const client: LLMClient = {
        name: 'fake',
        complete: vi.fn(async (messages) => {
            const fragments = splitFragments(messages[messages.length - 1].content);
            const result = complete(fragments, call++);

            if (result instanceof Error) {
                throw result;
            }

            return {text: result.join(`\n${FRAGMENT_SEPARATOR}\n`)};
        }),
    };

    return client;
}

function makeParams(client: LLMClient, config: Partial<AITranslationConfig> = {}) {
    const warn = vi.fn();
    const stat = {inputTokens: 0, outputTokens: 0, requests: 0, bytes: 0};
    const cache = new Map<string, Defer>();

    return {
        params: {
            client,
            config: {
                userPrompt: '{{fragments}}',
                promptMode: 'append',
                glossaryPairs: [],
                temperature: 0,
                maxOutputTokens: 100,
                maxBatchTokens: 20,
                maxConcurrency: 2,
                retry: 0,
                dryRun: false,
                ...config,
            } as AITranslationConfig,
            sourceLanguage: 'ru',
            targetLanguage: 'en',
            cache,
            stat,
            logger: {warn} as unknown as Logger,
        },
        warn,
        stat,
        cache,
    };
}

const translated = (fragments: string[]) => fragments.map((text) => `T:${text}`);

describe('translate ai provider', () => {
    describe('makeTranslator', () => {
        it('should translate texts through the client', async () => {
            const client = makeClient(translated);
            const {params} = makeParams(client);
            const translate = makeTranslator(params);

            const result = await translate('file.md', ['One', 'Two']);

            expect(result).toEqual(['T:One', 'T:Two']);
            expect(client.complete).toHaveBeenCalledTimes(1);
        });

        it('should split batches by token budget', async () => {
            const client = makeClient(translated);
            // ~10 tokens each with a 15 tokens budget - one text per batch.
            const {params} = makeParams(client, {maxBatchTokens: 15});
            const translate = makeTranslator(params);

            const result = await translate('file.md', ['a'.repeat(40), 'b'.repeat(40)]);

            expect(result).toEqual(['T:' + 'a'.repeat(40), 'T:' + 'b'.repeat(40)]);
            expect(client.complete).toHaveBeenCalledTimes(2);
        });

        it('should dedupe repeated units via cache', async () => {
            const client = makeClient(translated);
            const {params} = makeParams(client);
            const translate = makeTranslator(params);

            const result = await translate('file.md', ['Same', 'Same', 'Other']);

            expect(result).toEqual(['T:Same', 'T:Same', 'T:Other']);
            expect(client.complete).toHaveBeenCalledTimes(1);

            const again = await translate('other.md', ['Same']);

            expect(again).toEqual(['T:Same']);
            expect(client.complete).toHaveBeenCalledTimes(1);
        });

        it('should retry one-by-one when fragment count mismatches', async () => {
            const client = makeClient((fragments, call) => {
                // First (batched) response merges everything into one fragment.
                if (call === 0) {
                    return ['merged'];
                }
                return translated(fragments);
            });
            const {params, warn} = makeParams(client);
            const translate = makeTranslator(params);

            const result = await translate('file.md', ['One', 'Two']);

            expect(result).toEqual(['T:One', 'T:Two']);
            expect(client.complete).toHaveBeenCalledTimes(3);
            expect(warn).toHaveBeenCalledWith('file.md', expect.stringContaining('one-by-one'));
        });

        it('should reject and evict cached defers when the batch fails', async () => {
            const client = makeClient(() => new LLMAuthError('denied'));
            const {params, cache} = makeParams(client);
            const translate = makeTranslator(params);

            await expect(translate('file.md', ['One', 'Two'])).rejects.toThrow('denied');
            expect(cache.size).toBe(0);
        });

        it('should skip oversized units and keep source text', async () => {
            const client = makeClient(translated);
            const {params, warn} = makeParams(client, {maxBatchTokens: 5});
            const translate = makeTranslator(params);

            const oversized = 'x'.repeat(100);
            const result = await translate('file.md', [oversized]);

            expect(result).toEqual([oversized]);
            expect(client.complete).not.toHaveBeenCalled();
            expect(warn).toHaveBeenCalledWith('file.md', expect.stringContaining('too big'));
        });

        it('should estimate usage without client calls on dry run', async () => {
            const client = makeClient(translated);
            const {params, stat} = makeParams(client, {dryRun: true});
            const translate = makeTranslator(params);

            const result = await translate('file.md', ['One', 'Two']);

            expect(result).toEqual(['One', 'Two']);
            expect(client.complete).not.toHaveBeenCalled();
            expect(stat.requests).toBe(1);
            expect(stat.inputTokens).toBeGreaterThan(0);
        });
    });
});
