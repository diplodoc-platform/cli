import type {TranslateLogger} from '../../logger';
import type {AITranslationConfig} from './index';
import type {LLMClient} from './clients/types';
import type {Defer} from './utils';

import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';

import {
    Provider,
    extractTitle,
    makeStore,
    makeTranslator,
    normalizeCached,
    untranslatedMarker,
    unwrapUnit,
} from './provider';
import {FRAGMENT_SEPARATOR, splitFragments} from './prompts';
import {LLMAuthError, LLMRateLimitError, TranslationStore, cacheFingerprint} from './utils';

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
    const stat = {
        inputTokens: 0,
        outputTokens: 0,
        requests: 0,
        bytes: 0,
        cached: 0,
        untranslated: 0,
    };
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

function makeFullClient() {
    return {
        name: 'fake',
        complete: vi.fn(async (messages: {role: string; content: string}[]) => {
            // Judge requests are recognized by the reviewer system prompt.
            if (messages[0].content.includes('strict reviewer')) {
                const count = (messages[1].content.match(/^\[\d+\]$/gm) || []).length;
                const scores = Array.from({length: count}, (_, i) => ({
                    index: i + 1,
                    score: 50 + i,
                    issue: 'test issue',
                }));
                return {text: JSON.stringify(scores)};
            }

            const fragments = splitFragments(messages[messages.length - 1].content);
            return {
                text: fragments.map((text) => 'T:' + text).join(`\n${FRAGMENT_SEPARATOR}\n`),
            };
        }),
    } as LLMClient;
}

describe('translate ai provider', () => {
    describe('Provider.translate', () => {
        it('should translate files end to end and write a judge report', async () => {
            const root = mkdtempSync(join(tmpdir(), 'yfm-ai-e2e-'));
            const input = join(root, 'docs');
            const output = join(root, 'out');
            mkdirSync(join(input, 'ru'), {recursive: true});
            writeFileSync(join(input, 'ru', 'test.md'), '# Заголовок\n\nПривет, мир.\n');

            const client = makeFullClient();
            const provider = new Provider(() => client, {} as never);
            const logger = {
                translate: vi.fn(),
                translated: vi.fn(),
                request: vi.fn(),
                stat: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            };
            Object.assign(provider, {logger});

            await provider.translate(['ru/test.md'], {
                input,
                output,
                source: {language: 'ru', locale: 'RU'},
                target: [{language: 'en', locale: 'US'}],
                vars: {},
                dryRun: false,
                judge: true,
                judgeThreshold: 80,
                userPrompt: '{{fragments}}',
                promptMode: 'append',
                glossaryPairs: [],
                temperature: 0,
                maxOutputTokens: 200,
                maxBatchTokens: 100,
                maxConcurrency: 2,
                retry: 0,
            } as unknown as AITranslationConfig);

            const result = readFileSync(join(output, 'en', 'test.md'), 'utf8');
            expect(result).toContain('T:Заголовок');
            expect(result).toContain('T:Привет, мир.');
            expect(logger.error).not.toHaveBeenCalled();

            const report = JSON.parse(
                readFileSync(join(output, 'translate-quality.en.json'), 'utf8'),
            );
            expect(report.scored).toBeGreaterThan(0);
            expect(report.low).toBeGreaterThan(0);
            expect(logger.warn).toHaveBeenCalledWith('ru/test.md', expect.stringContaining('/100'));
        });

        it('should retry files that failed with transient errors after the main pass', async () => {
            const root = mkdtempSync(join(tmpdir(), 'yfm-ai-sweep-'));
            const input = join(root, 'docs');
            const output = join(root, 'out');
            mkdirSync(join(input, 'ru'), {recursive: true});
            writeFileSync(join(input, 'ru', 'test.md'), '# Заголовок\n\nПривет, мир.\n');

            let calls = 0;
            const client: LLMClient = {
                name: 'fake',
                complete: vi.fn(async (messages) => {
                    if (calls++ === 0) {
                        throw new LLMRateLimitError('Too Many Requests');
                    }
                    const fragments = splitFragments(messages[messages.length - 1].content);
                    return {
                        text: fragments
                            .map((text) => 'T:' + text)
                            .join(`\n${FRAGMENT_SEPARATOR}\n`),
                    };
                }),
            };

            const provider = new Provider(() => client, {} as never);
            const logger = {
                translate: vi.fn(),
                translated: vi.fn(),
                request: vi.fn(),
                stat: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            };
            Object.assign(provider, {logger});

            await provider.translate(['ru/test.md'], {
                input,
                output,
                source: {language: 'ru', locale: 'RU'},
                target: [{language: 'en', locale: 'US'}],
                vars: {},
                dryRun: false,
                judge: false,
                userPrompt: '{{fragments}}',
                promptMode: 'append',
                glossaryPairs: [],
                temperature: 0,
                maxOutputTokens: 200,
                maxBatchTokens: 100,
                maxConcurrency: 2,
                retry: 0,
            } as unknown as AITranslationConfig);

            const result = readFileSync(join(output, 'en', 'test.md'), 'utf8');
            expect(result).toContain('T:Привет, мир.');
            expect(logger.error).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith(
                'ru/test.md',
                expect.stringContaining('retried after the main pass'),
            );
        });

        it('should report files that keep failing on the final retry as errors', async () => {
            const root = mkdtempSync(join(tmpdir(), 'yfm-ai-sweep-'));
            const input = join(root, 'docs');
            const output = join(root, 'out');
            mkdirSync(join(input, 'ru'), {recursive: true});
            writeFileSync(join(input, 'ru', 'test.md'), 'Привет, мир.\n');

            const client: LLMClient = {
                name: 'fake',
                complete: vi.fn(async () => {
                    throw new LLMRateLimitError('Too Many Requests');
                }),
            };

            const provider = new Provider(() => client, {} as never);
            const logger = {
                translate: vi.fn(),
                translated: vi.fn(),
                request: vi.fn(),
                stat: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            };
            Object.assign(provider, {logger});

            await provider.translate(['ru/test.md'], {
                input,
                output,
                source: {language: 'ru', locale: 'RU'},
                target: [{language: 'en', locale: 'US'}],
                vars: {},
                dryRun: false,
                judge: false,
                userPrompt: '{{fragments}}',
                promptMode: 'append',
                glossaryPairs: [],
                temperature: 0,
                maxOutputTokens: 200,
                maxBatchTokens: 100,
                maxConcurrency: 2,
                retry: 0,
            } as unknown as AITranslationConfig);

            expect(logger.error).toHaveBeenCalledWith(
                'ru/test.md',
                'Too Many Requests',
                'LLM_RATE_LIMIT',
            );
        });
    });

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

    describe('unwrapUnit', () => {
        it('should split the xliff source wrapper from the text', () => {
            const unit = '<source xml:space="preserve">Привет, <g id="g-1">мир</g></source>';

            expect(unwrapUnit(unit)).toEqual({
                open: '<source xml:space="preserve">',
                text: 'Привет, <g id="g-1">мир</g>',
                close: '</source>',
            });
        });

        it('should pass plain text through unchanged', () => {
            expect(unwrapUnit('Просто текст')).toEqual({
                open: '',
                text: 'Просто текст',
                close: '',
            });
        });
    });

    describe('untranslatedMarker', () => {
        it('should mark source-script text for cross-script pairs', () => {
            const marker = untranslatedMarker('ru', 'en');

            expect(marker?.test('Привет')).toBe(true);
            expect(marker?.test('Hello')).toBe(false);
        });

        it('should not discriminate a Latin source', () => {
            expect(untranslatedMarker('en', 'ru')).toBeNull();
        });

        it('should not discriminate same-script pairs', () => {
            expect(untranslatedMarker('ru', 'uk')).toBeNull();
        });

        it('should ignore scripts shared with the target', () => {
            const marker = untranslatedMarker('ja', 'zh');

            expect(marker?.test('ドキュメント')).toBe(true);
            expect(marker?.test('文档')).toBe(false);
        });

        it('should disable the check for unknown languages', () => {
            expect(untranslatedMarker('!!', 'en')).toBeNull();
        });
    });

    describe('normalizeCached', () => {
        it('should strip a tilde fence', () => {
            expect(normalizeCached('Исходный текст', '~~~\nПеревод\n~~~')).toBe('Перевод');
        });

        it('should strip fences longer than three characters', () => {
            expect(normalizeCached('Исходный текст', '````\nПеревод\n````')).toBe('Перевод');
            expect(normalizeCached('Исходный текст', '~~~~~\nПеревод\n~~~~~')).toBe('Перевод');
        });

        it('should accept a closing fence longer than the opening one', () => {
            expect(normalizeCached('Исходный текст', '```\nПеревод\n`````')).toBe('Перевод');
        });

        it('should strip fences with an arbitrary info string', () => {
            expect(normalizeCached('Исходный текст', '```js title="a.js"\nПеревод\n```')).toBe(
                'Перевод',
            );
        });

        it('should keep fences nested inside a longer wrapper', () => {
            const stored = '````markdown\nПеревод\n\n```bash\nls\n```\n````';

            expect(normalizeCached('Исходный текст', stored)).toBe('Перевод\n\n```bash\nls\n```');
        });

        it('should keep an unbalanced fence as is', () => {
            const shortClose = '````\nПеревод\n```';
            const otherChar = '```\nПеревод\n~~~';

            expect(normalizeCached('Исходный текст', shortClose)).toBe(shortClose);
            expect(normalizeCached('Исходный текст', otherChar)).toBe(otherChar);
        });

        it('should keep a value without a fence as is', () => {
            expect(normalizeCached('Исходный текст', 'Перевод')).toBe('Перевод');
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

        it('should strip a markdown code fence around the response', async () => {
            const unit = '<source xml:space="preserve">Исходный текст</source>';
            const clean = '<source xml:space="preserve">Plain translation</source>';
            const client = makeClient(() => ['```text\nPlain translation\n```']);
            const {params} = makeParams(client, {maxBatchTokens: 100});
            const translate = makeTranslator(params);

            const result = await translate('file.md', [unit]);

            expect(result).toEqual([clean]);
        });

        it('should not cache units returned untranslated by the model', async () => {
            const unit = '<source xml:space="preserve">Исходный текст</source>';
            const dir = mkdtempSync(join(tmpdir(), 'yfm-ai-store-'));
            const store = new TranslationStore(join(dir, 'store.json'), 'fp');
            store.load();
            const client = makeClient((fragments) => fragments);
            const {params, warn, stat} = makeParams(client, {maxBatchTokens: 100}, store);
            const translate = makeTranslator(params);

            const result = await translate('file.md', [unit]);

            expect(result).toEqual([unit]);
            expect(store.get(unit)).toBeUndefined();
            expect(stat.untranslated).toBe(1);
            expect(warn).toHaveBeenCalledWith(
                'file.md',
                'Unit returned untranslated by the model.',
            );
        });

        it('should cache identity responses for units without source-script text', async () => {
            const unit = '<source xml:space="preserve">GitHub API</source>';
            const dir = mkdtempSync(join(tmpdir(), 'yfm-ai-store-'));
            const store = new TranslationStore(join(dir, 'store.json'), 'fp');
            store.load();
            const client = makeClient((fragments) => fragments);
            const {params, warn, stat} = makeParams(client, {maxBatchTokens: 100}, store);
            const translate = makeTranslator(params);

            const result = await translate('file.md', [unit]);

            expect(result).toEqual([unit]);
            expect(store.get(unit)).toBe(unit);
            expect(stat.untranslated).toBe(0);
            expect(warn).not.toHaveBeenCalled();
        });

        it('should retry units cached untranslated by older runs', async () => {
            const unit = '<source xml:space="preserve">Исходный текст</source>';
            const dir = mkdtempSync(join(tmpdir(), 'yfm-ai-store-'));
            const store = new TranslationStore(join(dir, 'store.json'), 'fp');
            store.load();
            store.set(unit, unit);
            const client = makeClient(translated);
            const {params, stat} = makeParams(client, {maxBatchTokens: 100}, store);
            const translate = makeTranslator(params);

            const result = await translate('file.md', [unit]);

            const retranslated = '<source xml:space="preserve">T:Исходный текст</source>';
            expect(client.complete).toHaveBeenCalledTimes(1);
            expect(result).toEqual([retranslated]);
            expect(store.get(unit)).toBe(retranslated);
            expect(stat.cached).toBe(0);
        });

        it('should heal wrapper noise in cached entries without new requests', async () => {
            const unit = '<source xml:space="preserve">Исходный текст</source>';
            const clean = '<source xml:space="preserve">Cached translation</source>';
            const dir = mkdtempSync(join(tmpdir(), 'yfm-ai-store-'));
            const store = new TranslationStore(join(dir, 'store.json'), 'fp');
            store.load();
            store.set(unit, '```xml\n' + clean + '\n```');
            const client = makeClient(() => new Error('must not be called'));
            const {params, stat} = makeParams(client, {maxBatchTokens: 100}, store);
            const translate = makeTranslator(params);

            const result = await translate('file.md', [unit]);

            expect(client.complete).not.toHaveBeenCalled();
            expect(result).toEqual([clean]);
            expect(store.get(unit)).toBe(clean);
            expect(stat.cached).toBe(1);
        });

        it('should heal a <target> wrapper in cached entries', async () => {
            const unit = '<source xml:space="preserve">Исходный текст</source>';
            const clean = '<source xml:space="preserve">Cached translation</source>';
            const dir = mkdtempSync(join(tmpdir(), 'yfm-ai-store-'));
            const store = new TranslationStore(join(dir, 'store.json'), 'fp');
            store.load();
            store.set(unit, '<target>Cached translation</target>');
            const client = makeClient(() => new Error('must not be called'));
            const {params, stat} = makeParams(client, {maxBatchTokens: 100}, store);
            const translate = makeTranslator(params);

            const result = await translate('file.md', [unit]);

            expect(client.complete).not.toHaveBeenCalled();
            expect(result).toEqual([clean]);
            expect(store.get(unit)).toBe(clean);
            expect(stat.cached).toBe(1);
        });

        it('should retry rate limited requests with the rate limit budget', async () => {
            vi.useFakeTimers();
            try {
                const client = makeClient((fragments, call) =>
                    call === 0 ? new LLMRateLimitError('slow down') : translated(fragments),
                );
                const {params} = makeParams(client, {retry: 0, rateLimitRetry: 1});
                const translate = makeTranslator(params);

                const promise = translate('file.md', ['One']);
                const success = expect(promise).resolves.toEqual(['T:One']);

                await vi.runAllTimersAsync();
                await success;

                expect(client.complete).toHaveBeenCalledTimes(2);
            } finally {
                vi.useRealTimers();
            }
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

        it('should strip the xliff wrapper before prompting and restore it after', async () => {
            const unit = '<source xml:space="preserve">Привет, <g id="g-1">мир</g></source>';
            const client = makeClient(translated);
            const {params} = makeParams(client);
            const translate = makeTranslator(params);

            const result = await translate('file.md', [unit]);

            expect(result).toEqual([
                '<source xml:space="preserve">T:Привет, <g id="g-1">мир</g></source>',
            ]);

            const [messages] = vi.mocked(client.complete).mock.calls[0];
            expect(messages[1].content).not.toContain('<source');
            expect(messages[1].content).toContain('Привет, <g id="g-1">мир</g>');
        });

        it('should tolerate a stray trailing delimiter in the response', async () => {
            const client = makeClient((fragments) => [...translated(fragments), '']);
            const {params} = makeParams(client);
            const translate = makeTranslator(params);

            const result = await translate('file.md', ['One']);

            expect(result).toEqual(['T:One']);
            expect(client.complete).toHaveBeenCalledTimes(1);
        });

        it('should drop a stray leading delimiter in the response', async () => {
            const client = makeClient((fragments) => ['', ...translated(fragments)]);
            const {params} = makeParams(client);
            const translate = makeTranslator(params);

            const result = await translate('file.md', ['One']);

            expect(result).toEqual(['T:One']);
        });

        it('should keep the source text when the model returns an empty translation', async () => {
            const client = makeClient(() => ['', '']);
            const {params} = makeParams(client);
            const translate = makeTranslator(params);

            const result = await translate('file.md', ['Fake file']);

            expect(result).toEqual(['Fake file']);
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
