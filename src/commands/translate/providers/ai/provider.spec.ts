import type {TranslateLogger} from '../../logger';
import type {AITranslationConfig} from './index';
import type {LLMClient} from './clients/types';
import type {Defer} from './utils';

import {existsSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';

import {extractTitle, makeStore, makeTranslator} from './provider';
import {FRAGMENT_SEPARATOR, splitFragments} from './prompts';
import {LLMAuthError, TranslationStore, cacheFingerprint} from './utils';

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

function makeParams(
    client: LLMClient,
    config: Partial<AITranslationConfig> = {},
    store?: TranslationStore,
) {
    const warn = vi.fn();
    const request = vi.fn();
    const stat = {inputTokens: 0, outputTokens: 0, requests: 0, bytes: 0, cached: 0};
    const cache = new Map<string, Defer>();

    return {
        params: {
            store,
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
            logger: {warn, request} as unknown as TranslateLogger,
        },
        warn,
        request,
        stat,
        cache,
    };
}

const translated = (fragments: string[]) => fragments.map((text) => `T:${text}`);

describe('translate ai provider', () => {
    describe('extractTitle', () => {
        it('should extract the first H1 from markdown', () => {
            expect(extractTitle('Intro\n\n# Page title\n\n## Sub')).toBe('Page title');
        });

        it('should extract the title field from yaml documents', () => {
            expect(extractTitle({title: 'Toc title', items: []})).toBe('Toc title');
        });

        it('should return undefined when there is no title', () => {
            expect(extractTitle('plain text')).toBeUndefined();
            expect(extractTitle({items: []})).toBeUndefined();
        });
    });

    describe('makeStore', () => {
        it('should return undefined without cacheDir', () => {
            const client = makeClient(translated);

            expect(makeStore(client, {} as AITranslationConfig, 'ru', 'en')).toBeUndefined();
        });

        it('should create a store file per provider and language pair', async () => {
            const dir = mkdtempSync(join(tmpdir(), 'yfm-ai-store-'));
            const client = makeClient(translated);
            const config = {
                cacheDir: dir,
                model: 'model',
                promptMode: 'append',
                glossaryPairs: [],
            } as unknown as AITranslationConfig;

            const store = makeStore(client, config, 'ru', 'en');

            expect(store).toBeDefined();
            store?.load();
            store?.set('Привет', 'Hello');
            store?.flush();

            const reopened = makeStore(client, config, 'ru', 'en');
            reopened?.load();

            expect(reopened?.get('Привет')).toBe('Hello');
            expect(existsSync(join(dir, 'fake.model.ru-en.json'))).toBe(true);
        });

        it('should sanitize model names in the cache file name', () => {
            const dir = mkdtempSync(join(tmpdir(), 'yfm-ai-store-'));
            const client = makeClient(translated);
            const config = {
                cacheDir: dir,
                model: 'gpt://b1g/yandexgpt/latest',
                promptMode: 'append',
                glossaryPairs: [],
            } as unknown as AITranslationConfig;

            const store = makeStore(client, config, 'ru', 'en');
            store?.load();
            store?.set('Привет', 'Hello');
            store?.flush();

            expect(existsSync(join(dir, 'fake.gpt-b1g-yandexgpt-latest.ru-en.json'))).toBe(true);
        });

        it('should keep separate caches per model', () => {
            const dir = mkdtempSync(join(tmpdir(), 'yfm-ai-store-'));
            const client = makeClient(translated);
            const base = {
                cacheDir: dir,
                promptMode: 'append',
                glossaryPairs: [],
            };

            const lite = makeStore(
                client,
                {...base, model: 'lite'} as unknown as AITranslationConfig,
                'ru',
                'en',
            );
            lite?.load();
            lite?.set('Привет', 'Hello');
            lite?.flush();

            const pro = makeStore(
                client,
                {...base, model: 'pro'} as unknown as AITranslationConfig,
                'ru',
                'en',
            );
            pro?.load();
            pro?.set('Привет', 'Hi there');
            pro?.flush();

            // Switching back to the first model must not lose its translations.
            const liteAgain = makeStore(
                client,
                {...base, model: 'lite'} as unknown as AITranslationConfig,
                'ru',
                'en',
            );
            liteAgain?.load();

            expect(liteAgain?.get('Привет')).toBe('Hello');
        });
    });

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

        it('should pass document context into prompts', async () => {
            const client = makeClient(translated);
            const {params} = makeParams(client, {systemPrompt: 'CONTEXT: {{context}}'});
            const translate = makeTranslator(params);

            await translate('docs/ru/index.md', ['One'], {title: 'Quickstart'});

            const [messages] = vi.mocked(client.complete).mock.calls[0];
            expect(messages[0].content).toContain(
                'CONTEXT: Document context: document "Quickstart" (file docs/ru/index.md).',
            );
        });

        it('should fall back to file path context without title', async () => {
            const client = makeClient(translated);
            const {params} = makeParams(client, {systemPrompt: 'CONTEXT: {{context}}'});
            const translate = makeTranslator(params);

            await translate('docs/ru/index.md', ['One']);

            const [messages] = vi.mocked(client.complete).mock.calls[0];
            expect(messages[0].content).toContain(
                'CONTEXT: Document context: file docs/ru/index.md.',
            );
        });

        it('should reuse translations from the persistent store', async () => {
            const file = join(mkdtempSync(join(tmpdir(), 'yfm-ai-store-')), 'store.json');
            const fingerprint = cacheFingerprint({model: 'fake'});

            const warmup = new TranslationStore(file, fingerprint);
            warmup.load();
            warmup.set('One', 'T:One');
            warmup.flush();

            const client = makeClient(translated);
            const store = new TranslationStore(file, fingerprint);
            store.load();
            const {params, stat} = makeParams(client, {}, store);
            const translate = makeTranslator(params);

            const result = await translate('file.md', ['One']);

            expect(result).toEqual(['T:One']);
            expect(client.complete).not.toHaveBeenCalled();
            expect(stat.cached).toBe(1);
        });

        it('should save fresh translations into the persistent store', async () => {
            const file = join(mkdtempSync(join(tmpdir(), 'yfm-ai-store-')), 'store.json');
            const fingerprint = cacheFingerprint({model: 'fake'});

            const client = makeClient(translated);
            const store = new TranslationStore(file, fingerprint);
            store.load();
            const {params} = makeParams(client, {}, store);
            const translate = makeTranslator(params);

            await translate('file.md', ['One', 'Two']);
            store.flush();

            const reopened = new TranslationStore(file, fingerprint);
            reopened.load();

            expect(reopened.get('One')).toBe('T:One');
            expect(reopened.get('Two')).toBe('T:Two');
        });

        it('should not poison the store on dry run', async () => {
            const file = join(mkdtempSync(join(tmpdir(), 'yfm-ai-store-')), 'store.json');
            const fingerprint = cacheFingerprint({model: 'fake'});

            const client = makeClient(translated);
            const store = new TranslationStore(file, fingerprint);
            store.load();
            const {params} = makeParams(client, {dryRun: true}, store);
            const translate = makeTranslator(params);

            await translate('file.md', ['One']);
            store.flush();

            expect(store.get('One')).toBeUndefined();
        });

        it('should log a request line when a batch is sent', async () => {
            const client = makeClient(translated);
            const {params, request} = makeParams(client);
            const translate = makeTranslator(params);

            await translate('file.md', ['One', 'Two']);

            expect(request).toHaveBeenCalledWith('file.md', expect.stringContaining('2 units'));
        });

        it('should not log request lines on dry run', async () => {
            const client = makeClient(translated);
            const {params, request} = makeParams(client, {dryRun: true});
            const translate = makeTranslator(params);

            await translate('file.md', ['One']);

            expect(request).not.toHaveBeenCalled();
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
