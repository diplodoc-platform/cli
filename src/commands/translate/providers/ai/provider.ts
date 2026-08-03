import type {Logger} from '~/core/logger';
import type {TranslateConfig} from '~/commands/translate';
import type {AITranslationConfig} from './index';
import type {LLMClient} from './clients/types';
import type {JudgePair} from './judge';

import {writeFile} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';
import {asyncify, eachLimit} from 'async';
import liquid from '@diplodoc/transform/lib/liquid';

import {LogLevel} from '~/core/logger';

import {FileLoader, TranslateError, compose, extract, resolveSchemas} from '../../utils';
import {TranslateLogger} from '../../logger';

import {
    Defer,
    LLMResponseError,
    TranslationStore,
    backoff,
    bytes,
    cacheFingerprint,
    estimateTokens,
} from './utils';
import {
    DEFAULT_SYSTEM_PROMPT,
    DEFAULT_USER_PROMPT,
    buildMessages,
    splitFragments,
} from './prompts';
import {judgeTranslations} from './judge';

const SOURCE_PREVIEW_LIMIT = 80;

const onFatalError = () => {
    process.exit(1);
};

export type ClientFactory = (config: AITranslationConfig) => LLMClient;

export class Provider {
    readonly logger: TranslateLogger;

    private readonly clientFactory: ClientFactory;

    constructor(clientFactory: ClientFactory, config: TranslateConfig) {
        this.clientFactory = clientFactory;
        this.logger = new TranslateLogger(config);
    }

    pipe(logger: Logger) {
        this.logger.pipe(logger);
    }

    async skip(skipped: [string, string][]) {
        this.logger.skipped(skipped);
    }

    async translate(files: string[], config: AITranslationConfig) {
        const client = this.clientFactory(config);
        const {input, output, source, target: targets, vars, dryRun, maxConcurrency} = config;

        try {
            for (const target of targets) {
                const cache = new Map<string, Defer>();
                const stat = {inputTokens: 0, outputTokens: 0, requests: 0, bytes: 0, cached: 0};
                const store = makeStore(client, config, source.language, target.language);

                store?.load();

                const translate = makeTranslator({
                    client,
                    config,
                    sourceLanguage: source.language,
                    targetLanguage: target.language,
                    cache,
                    store,
                    stat,
                    logger: this.logger,
                });

                const pairs: JudgePair[] = [];
                const collect =
                    config.judge && !dryRun
                        ? (path: string, units: string[], parts: string[]) => {
                              units.forEach((unit, index) => {
                                  if (parts[index] !== undefined && parts[index] !== unit) {
                                      pairs.push({path, source: unit, translation: parts[index]});
                                  }
                              });
                          }
                        : undefined;

                const processFile = makeProcessor({
                    input,
                    output,
                    sourceLanguage: source.language,
                    targetLanguage: target.language,
                    vars,
                    translate,
                    onTranslated: collect,
                });

                await eachLimit(
                    files,
                    maxConcurrency,
                    asyncify(async (file: string) => {
                        try {
                            this.logger.translate(file);
                            await processFile(file);
                            // Flush after every file to keep progress on crashes.
                            store?.flush();
                            if (!dryRun) {
                                this.logger.translated(file);
                            }
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        } catch (error: any) {
                            if (error instanceof TranslateError) {
                                this.logger.error(file, `${error.message}`, error.code);
                                if (error.fatal) {
                                    onFatalError();
                                }
                            } else {
                                this.logger.error(file, error.message);
                            }
                        }
                    }),
                );

                store?.flush();

                this.logger.stat(
                    `requests: ${stat.requests} input-tokens: ${stat.inputTokens} ` +
                        `output-tokens: ${stat.outputTokens} bytes: ${stat.bytes} ` +
                        `cached-units: ${stat.cached}`,
                );

                if (pairs.length) {
                    await this.judge(pairs, config, source.language, target.language);
                }
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            if (error instanceof TranslateError) {
                this.logger.topic(LogLevel.ERROR, error.code)(error.message);
            } else {
                this.logger.error(error);
            }
            process.exit(1);
        }
    }

    /**
     * Scores translated units with the judge model and writes a quality
     * report next to the translated files. Best-effort: judge failures
     * never fail the translation run.
     */
    private async judge(
        pairs: JudgePair[],
        config: AITranslationConfig,
        sourceLanguage: string,
        targetLanguage: string,
    ) {
        const client = this.clientFactory(
            config.judgeModel ? {...config, model: config.judgeModel} : config,
        );

        const verdicts = await judgeTranslations({
            client,
            pairs,
            sourceLanguage,
            targetLanguage,
            maxBatchTokens: config.maxBatchTokens,
            maxOutputTokens: config.maxOutputTokens,
            maxConcurrency: config.maxConcurrency,
            retry: config.retry,
            logger: this.logger,
        });

        const threshold = config.judgeThreshold;
        const low = verdicts
            .filter((verdict) => verdict.score < threshold)
            .sort((a, b) => a.score - b.score);

        for (const verdict of low) {
            const preview =
                verdict.source.length > SOURCE_PREVIEW_LIMIT
                    ? verdict.source.slice(0, SOURCE_PREVIEW_LIMIT) + '...'
                    : verdict.source;
            this.logger.warn(
                verdict.path,
                `Translation quality ${verdict.score}/100: ${preview}` +
                    (verdict.issue ? ` (${verdict.issue})` : ''),
            );
        }

        const report = join(resolve(config.output), `translate-quality.${targetLanguage}.json`);
        await writeFile(
            report,
            JSON.stringify(
                {
                    model: config.judgeModel || config.model,
                    threshold,
                    scored: verdicts.length,
                    low: low.length,
                    segments: low,
                },
                null,
                2,
            ),
        );

        this.logger.stat(
            `judge: scored ${verdicts.length} units, ${low.length} below ${threshold} (${report})`,
        );
    }
}

type ProcessorParams = {
    input: string;
    output: string;
    sourceLanguage: string;
    targetLanguage: string;
    vars: Hash;
    translate: Translate;
    onTranslated?: (path: string, units: string[], parts: string[]) => void;
};

type Translate = (path: string, texts: string[], context?: DocContext) => Promise<string[]>;

export type DocContext = {
    title?: string;
};

/**
 * Extracts a human-readable document title to use as translation context:
 * the first H1 for markdown, the `title` field for yaml documents.
 */
export function extractTitle(data: unknown): string | undefined {
    if (typeof data === 'string') {
        for (const line of data.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('# ') || trimmed.startsWith('#\t')) {
                return trimmed.slice(2).trim();
            }
        }
        return undefined;
    }

    if (data && typeof data === 'object') {
        const title = (data as {title?: unknown}).title;
        if (typeof title === 'string') {
            return title;
        }
    }

    return undefined;
}

function describeDocument(path: string, context?: DocContext): string {
    return context?.title ? `document "${context.title}" (file ${path})` : `file ${path}`;
}

function makeProcessor(params: ProcessorParams) {
    const {input, output, sourceLanguage, targetLanguage, vars, translate, onTranslated} = params;
    const inputRoot = resolve(input);
    const outputRoot = resolve(output);

    return async function (path: string) {
        const ext = extname(path);
        if (!['.yaml', '.md'].includes(ext)) {
            return;
        }

        const inputPath = join(inputRoot, path);
        const outputPath = (path: string) =>
            join(
                outputRoot,
                path
                    .replace(inputRoot, '')
                    .replace('/' + sourceLanguage + '/', '/' + targetLanguage + '/'),
            );

        const content = new FileLoader(inputPath);
        await content.load();

        if (Object.keys(vars).length && content.isString) {
            content.set(
                liquid(content.data as string, vars, inputPath, {
                    conditions: 'strict',
                    substitutions: false,
                    cycles: false,
                }),
            );
        }

        if (!content.data) {
            await content.dump(outputPath);
            return;
        }

        const {schemas, ajvOptions} = await resolveSchemas({content: content.data, path});
        const {units, skeleton} = extract(content.data, {
            compact: true,
            source: {language: sourceLanguage, locale: 'RU'},
            target: {language: targetLanguage, locale: 'US'},
            schemas,
            ajvOptions,
        });

        if (!units.length) {
            await content.dump(outputPath);
            return;
        }

        const parts = await translate(path, units, {title: extractTitle(content.data)});

        onTranslated?.(path, units, parts);

        content.set(compose(skeleton, parts, {useSource: true, schemas, ajvOptions}));
        await content.dump(outputPath);
    };
}

type TranslatorParams = {
    client: LLMClient;
    config: AITranslationConfig;
    sourceLanguage: string;
    targetLanguage: string;
    cache: Map<string, Defer>;
    store?: TranslationStore;
    stat: {
        inputTokens: number;
        outputTokens: number;
        requests: number;
        bytes: number;
        cached: number;
    };
    logger: Logger;
};

/**
 * Creates a persistent translation store when --cache-dir is configured.
 * The fingerprint covers everything that affects the output, so changing
 * the model, prompts or glossary safely resets the cache.
 */
export function makeStore(
    client: LLMClient,
    config: AITranslationConfig,
    sourceLanguage: string,
    targetLanguage: string,
): TranslationStore | undefined {
    if (!config.cacheDir) {
        return undefined;
    }

    const file = join(config.cacheDir, `${client.name}.${sourceLanguage}-${targetLanguage}.json`);
    // Built-in prompts are part of the fingerprint too: when a CLI update
    // changes them, stored translations are stale and must not be served.
    const fingerprint = cacheFingerprint({
        provider: client.name,
        model: config.model,
        source: sourceLanguage,
        target: targetLanguage,
        promptMode: config.promptMode,
        systemPrompt: config.systemPrompt,
        userPrompt: config.userPrompt,
        defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
        defaultUserPrompt: DEFAULT_USER_PROMPT,
        glossaryPairs: config.glossaryPairs,
    });

    return new TranslationStore(file, fingerprint);
}

export function makeTranslator(params: TranslatorParams): Translate {
    const {client, config, sourceLanguage, targetLanguage, cache, store, stat, logger} = params;
    const {
        systemPrompt,
        userPrompt,
        promptMode,
        glossaryPairs,
        temperature,
        maxOutputTokens,
        maxBatchTokens,
        maxConcurrency,
        retry,
        dryRun,
    } = config;

    const schedule = scheduler(maxConcurrency);

    async function translateBatch(fragments: string[], context: string): Promise<string[]> {
        if (!fragments.length) {
            return [];
        }

        const messages = buildMessages(fragments, {
            systemPrompt,
            userPrompt,
            promptMode,
            sourceLanguage,
            targetLanguage,
            glossaryPairs,
            context,
        });

        if (dryRun) {
            const inputTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
            stat.inputTokens += inputTokens;
            stat.outputTokens += fragments.reduce((sum, f) => sum + estimateTokens(f), 0);
            stat.requests++;
            stat.bytes += bytes(fragments);
            return fragments;
        }

        const result = await backoff(
            () => client.complete(messages, {temperature, maxTokens: maxOutputTokens}),
            retry,
        );

        stat.requests++;
        stat.bytes += bytes(fragments);
        if (result.usage) {
            stat.inputTokens += result.usage.inputTokens;
            stat.outputTokens += result.usage.outputTokens;
        }

        const parts = splitFragments(result.text);

        if (parts.length !== fragments.length) {
            throw new LLMResponseError(
                `Expected ${fragments.length} fragments in LLM response, got ${parts.length}`,
            );
        }

        return parts;
    }

    async function translateWithFallback(
        path: string,
        fragments: string[],
        context: string,
    ): Promise<string[]> {
        try {
            return await translateBatch(fragments, context);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            if (error instanceof LLMResponseError && fragments.length > 1) {
                logger.warn(
                    path,
                    `Batch of ${fragments.length} fragments failed (${error.message}); retrying one-by-one.`,
                );
                const result: string[] = [];
                for (const fragment of fragments) {
                    const single = await translateBatch([fragment], context);
                    result.push(single[0]);
                }
                return result;
            }
            throw error;
        }
    }

    return async function translate(path: string, texts: string[], docContext?: DocContext) {
        const context = describeDocument(path, docContext);
        const promises: Promise<string>[] = [];
        const requests: Promise<void>[] = [];
        let buffer: string[] = [];
        let bufferTokens = 0;

        const release = () => {
            if (!buffer.length) {
                return;
            }
            const batch = buffer;
            requests.push(
                schedule(async () => {
                    try {
                        const translated = await translateWithFallback(path, batch, context);
                        translated.forEach((text, i) => {
                            cache.get(batch[i])?.resolve(text);
                            if (!dryRun) {
                                store?.set(batch[i], text);
                            }
                        });
                    } catch (error) {
                        // Reject and evict pending defers, otherwise files sharing
                        // the same units would await them forever.
                        for (const text of batch) {
                            const defer = cache.get(text);
                            if (defer) {
                                cache.delete(text);
                                defer.promise.catch(() => {});
                                defer.reject(error);
                            }
                        }
                    }
                }),
            );
            buffer = [];
            bufferTokens = 0;
        };

        for (const text of texts) {
            const tokens = estimateTokens(text);

            if (tokens > maxBatchTokens) {
                logger.warn(
                    path,
                    `Skip document part for translation. Part is too big (~${tokens} tokens > ${maxBatchTokens}).`,
                );
                promises.push(Promise.resolve(text));
                continue;
            }

            const stored = store?.get(text);
            if (stored !== undefined) {
                stat.cached++;
                promises.push(Promise.resolve(stored));
                continue;
            }

            const cached = cache.get(text);
            if (cached) {
                promises.push(cached.promise);
                continue;
            }

            const defer = new Defer();
            cache.set(text, defer);
            promises.push(defer.promise);

            if (bufferTokens + tokens > maxBatchTokens && buffer.length) {
                release();
            }
            buffer.push(text);
            bufferTokens += tokens;
        }

        release();

        await Promise.all(requests);

        return Promise.all(promises);
    };
}

function scheduler(limit: number) {
    let active = 0;
    const queue: (() => void)[] = [];

    // Passes the freed slot directly to the next queued task,
    // so `active` never exceeds `limit`.
    const next = () => {
        const task = queue.shift();
        if (task) {
            task();
        } else {
            active--;
        }
    };

    return async function <T>(action: () => Promise<T>): Promise<T> {
        if (active >= limit) {
            await new Promise<void>((resolve) => queue.push(resolve));
        } else {
            active++;
        }

        try {
            return await action();
        } finally {
            next();
        }
    };
}
