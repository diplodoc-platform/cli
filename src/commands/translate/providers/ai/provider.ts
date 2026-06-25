import type {Logger} from '~/core/logger';
import type {TranslateConfig} from '~/commands/translate';
import type {AITranslationConfig} from './index';
import type {LLMClient} from './clients/types';

import {extname, join, resolve} from 'node:path';
import {asyncify, eachLimit} from 'async';
import liquid from '@diplodoc/transform/lib/liquid';

import {LogLevel} from '~/core/logger';

import {FileLoader, TranslateError, compose, extract, resolveSchemas} from '../../utils';
import {TranslateLogger} from '../../logger';

import {Defer, backoff, bytes, estimateTokens, wait} from './utils';
import {LLMResponseError} from './utils/errors';
import {buildMessages, splitFragments} from './prompts';

const onFatalError = () => {
    process.exit(1);
};

type AITranslateConfig = TranslateConfig & AITranslationConfig;

export type ClientFactory = (config: AITranslateConfig) => LLMClient;

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

    async translate(files: string[], config: AITranslateConfig) {
        const client = this.clientFactory(config);
        const {input, output, source, target: targets, vars, dryRun, maxConcurrency} = config;

        try {
            for (const target of targets) {
                const cache = new Map<string, Defer>();
                const stat = {inputTokens: 0, outputTokens: 0, requests: 0, bytes: 0};

                const translate = makeTranslator({
                    client,
                    config,
                    sourceLanguage: source.language,
                    targetLanguage: target.language,
                    cache,
                    stat,
                    logger: this.logger,
                });

                const process = makeProcessor({
                    input,
                    output,
                    sourceLanguage: source.language,
                    targetLanguage: target.language,
                    vars,
                    translate,
                });

                await eachLimit(
                    files,
                    maxConcurrency,
                    asyncify(async (file: string) => {
                        try {
                            this.logger.translate(file);
                            await process(file);
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

                this.logger.stat(
                    `requests: ${stat.requests} input-tokens: ${stat.inputTokens} ` +
                        `output-tokens: ${stat.outputTokens} bytes: ${stat.bytes}`,
                );
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
}

type ProcessorParams = {
    input: string;
    output: string;
    sourceLanguage: string;
    targetLanguage: string;
    vars: Hash;
    translate: Translate;
};

type Translate = (path: string, texts: string[]) => Promise<string[]>;

function makeProcessor(params: ProcessorParams) {
    const {input, output, sourceLanguage, targetLanguage, vars, translate} = params;
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

        const parts = await translate(path, units);

        content.set(compose(skeleton, parts, {useSource: true, schemas, ajvOptions}));
        await content.dump(outputPath);
    };
}

type TranslatorParams = {
    client: LLMClient;
    config: AITranslateConfig;
    sourceLanguage: string;
    targetLanguage: string;
    cache: Map<string, Defer>;
    stat: {inputTokens: number; outputTokens: number; requests: number; bytes: number};
    logger: Logger;
};

function makeTranslator(params: TranslatorParams): Translate {
    const {client, config, sourceLanguage, targetLanguage, cache, stat, logger} = params;
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

    async function translateBatch(fragments: string[]): Promise<string[]> {
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

    async function translateWithFallback(fragments: string[]): Promise<string[]> {
        try {
            return await translateBatch(fragments);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            if (error instanceof LLMResponseError && fragments.length > 1) {
                logger.warn(
                    `Batch of ${fragments.length} fragments failed (${error.message}); retrying one-by-one.`,
                );
                const result: string[] = [];
                for (const fragment of fragments) {
                    const single = await translateBatch([fragment]);
                    result.push(single[0]);
                }
                return result;
            }
            throw error;
        }
    }

    return async function translate(_path: string, texts: string[]) {
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
                    const translated = await translateWithFallback(batch);
                    translated.forEach((text, i) => {
                        cache.get(batch[i])?.resolve(text);
                    });
                }),
            );
            buffer = [];
            bufferTokens = 0;
        };

        for (const text of texts) {
            const tokens = estimateTokens(text);

            if (cache.has(text)) {
                promises.push(cache.get(text)!.promise);
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

    const next = () => {
        if (active >= limit) {
            return;
        }
        const task = queue.shift();
        if (task) {
            task();
        }
    };

    return async function <T>(action: () => Promise<T>): Promise<T> {
        if (active >= limit) {
            await new Promise<void>((resolve) => queue.push(resolve));
        }
        active++;
        try {
            return await action();
        } finally {
            active--;
            await wait(0);
            next();
        }
    };
}
