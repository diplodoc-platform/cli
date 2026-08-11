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

import {
    FileLoader,
    TranslateError,
    compose,
    extract,
    languageRepath,
    resolveSchemas,
} from '../../utils';
import {TranslateLogger} from '../../logger';

import {
    Defer,
    LLMResponseError,
    RateGate,
    TranslationStore,
    backoff,
    bytes,
    cacheFingerprint,
    estimateTokens,
} from './utils';
import {DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT, buildMessages, splitFragments} from './prompts';
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
                const stat = {
                    inputTokens: 0,
                    outputTokens: 0,
                    requests: 0,
                    bytes: 0,
                    cached: 0,
                    untranslated: 0,
                };
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
                                  if (parts[index] === undefined || parts[index] === unit) {
                                      return;
                                  }
                                  pairs.push({
                                      path,
                                      source: unwrapUnit(unit).text,
                                      translation: unwrapUnit(parts[index]).text,
                                  });
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

                await this.processFiles({files, maxConcurrency, dryRun, store, processFile});

                store?.flush();

                this.logger.stat(
                    `requests: ${stat.requests} input-tokens: ${stat.inputTokens} ` +
                        `output-tokens: ${stat.outputTokens} bytes: ${stat.bytes} ` +
                        `cached-units: ${stat.cached} untranslated-units: ${stat.untranslated}`,
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
     * Runs files through the processor with bounded concurrency. Files
     * that fail with transient errors (rate limits, 5xx) are queued and
     * retried in one final sweep after the main pass, when the endpoint
     * has usually recovered; the unit cache makes the sweep cheap.
     */
    private async processFiles(params: {
        files: string[];
        maxConcurrency: number;
        dryRun: boolean;
        store?: TranslationStore;
        processFile: (file: string) => Promise<void>;
    }) {
        const {files, maxConcurrency, dryRun, store, processFile} = params;
        const failed: string[] = [];

        const run = async (file: string, finalPass: boolean) => {
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
                // Transient errors exhaust their retry budget under load,
                // but the endpoint usually recovers by the end of the run -
                // queue the file for one final sweep.
                if (!finalPass && error?.retryable === true) {
                    failed.push(file);
                    this.logger.warn(
                        file,
                        `${error.message}; the file will be retried after the main pass.`,
                    );
                    return;
                }
                this.reportFileError(file, error);
            }
        };

        await eachLimit(
            files,
            maxConcurrency,
            asyncify((file: string) => run(file, false)),
        );

        if (failed.length) {
            this.logger.info(
                `Retrying ${failed.length} file(s) that failed with transient errors.`,
            );
            await eachLimit(
                failed,
                maxConcurrency,
                asyncify((file: string) => run(file, true)),
            );
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private reportFileError(file: string, error: any) {
        if (error instanceof TranslateError) {
            this.logger.error(file, `${error.message}`, error.code);
            if (error.fatal) {
                onFatalError();
            }
        } else {
            this.logger.error(file, error.message);
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

        const {verdicts, skippedBatches, skippedPairs} = await judgeTranslations({
            client,
            pairs,
            sourceLanguage,
            targetLanguage,
            maxBatchTokens: config.maxBatchTokens,
            maxOutputTokens: config.maxOutputTokens,
            maxConcurrency: config.maxConcurrency,
            retry: config.retry,
            rateLimitRetry: config.rateLimitRetry,
            logger: this.logger,
        });

        const threshold = config.judgeThreshold;
        const low = verdicts
            .filter((verdict) => verdict.score < threshold)
            .sort((a, b) => a.score - b.score);
        const average = verdicts.length
            ? Math.round(
                  (verdicts.reduce((sum, {score}) => sum + score, 0) / verdicts.length) * 10,
              ) / 10
            : 0;

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
                    skipped: {batches: skippedBatches, pairs: skippedPairs},
                    averageScore: average,
                    low: low.length,
                    segments: low,
                },
                null,
                2,
            ),
        );

        this.logger.stat(
            `judge: ${verdicts.length} units scored, average score ${average}/100, ` +
                `${low.length} below threshold ${threshold}` +
                (skippedPairs ? `, ${skippedPairs} pair(s) unscored` : '') +
                ` (${report})`,
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

const SOURCE_OPEN = '<source';
const SOURCE_CLOSE = '</source>';

type UnitWrapper = {
    open: string;
    text: string;
    close: string;
};

/**
 * Units produced by extract are wrapped in an XLIFF `<source>` element.
 * The wrapper is transport framing for compose, not translatable content:
 * it is stripped before prompting and restored on the translated text,
 * so composing does not depend on the model echoing XML back.
 */
export function unwrapUnit(unit: string): UnitWrapper {
    const trimmed = unit.trim();

    if (trimmed.startsWith(SOURCE_OPEN) && trimmed.endsWith(SOURCE_CLOSE)) {
        const open = trimmed.indexOf('>');
        if (open !== -1) {
            return {
                open: trimmed.slice(0, open + 1),
                text: trimmed.slice(open + 1, -SOURCE_CLOSE.length),
                close: SOURCE_CLOSE,
            };
        }
    }

    return {open: '', text: unit, close: ''};
}

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
        const outputPath = languageRepath({inputRoot, outputRoot, sourceLanguage, targetLanguage});

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
        untranslated: number;
    };
    logger: TranslateLogger;
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

    // One file per model: switching models must not wipe another model's cache.
    const model = config.model.replace(/[^\w.-]+/g, '-');
    const file = join(
        config.cacheDir,
        `${client.name}.${model}.${sourceLanguage}-${targetLanguage}.json`,
    );
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

/**
 * CLDR composite script codes (ISO 15924) that are not valid Unicode
 * script property values: expanded into their component scripts.
 */
const COMPOSITE_SCRIPTS: Record<string, string[]> = {
    Hans: ['Han'],
    Hant: ['Han'],
    Jpan: ['Han', 'Hiragana', 'Katakana'],
    Kore: ['Hangul', 'Han'],
};

function scriptsOf(language: string): string[] {
    try {
        const script = new Intl.Locale(language).maximize().script;
        if (!script) {
            return [];
        }

        return COMPOSITE_SCRIPTS[script] || [script];
    } catch {
        return [];
    }
}

/**
 * Returns a regexp matching source-script characters that must not survive
 * translation, or null when the pair cannot be discriminated by script and
 * identity responses have to be trusted. The script of a language comes
 * from the CLDR likely-subtags data, so any language known to the runtime
 * is supported. Scripts shared with the target do not discriminate (e.g.
 * only kana counts for ja -> zh). A Latin source never discriminates:
 * code, identifiers and product names are Latin in documents of any
 * language, so a Latin identity response cannot be told apart from a
 * legitimately untranslatable unit.
 */
export function untranslatedMarker(sourceLanguage: string, targetLanguage: string): RegExp | null {
    const target = new Set(scriptsOf(targetLanguage));
    const source = scriptsOf(sourceLanguage).filter(
        (script) => script !== 'Latn' && !target.has(script),
    );

    if (!source.length) {
        return null;
    }

    try {
        return new RegExp(source.map((script) => `\\p{Script=${script}}`).join('|'), 'u');
    } catch {
        // Script codes unknown to the regexp engine disable the check.
        return null;
    }
}

/**
 * Models occasionally wrap the whole response in a markdown code fence.
 * The fence is never part of the translation.
 *
 * Fences are matched as CommonMark defines them: a run of at least three
 * backticks or tildes, closed by a run of the same character at least as
 * long, with an arbitrary info string on the opening line. The model
 * picks the flavour and the length itself (a longer run when the payload
 * contains fences of its own), so a fixed three-backtick prefix leaves
 * the rest of the variants unhandled.
 */
function stripFence(text: string): string {
    const body = text.trim();
    const open = body.match(/^(`{3,}|~{3,})([^\n]*)\n/);

    if (!open) {
        return text;
    }

    const [prefix, markup, info] = open;

    // A backtick fence cannot carry backticks in its info string.
    if (markup[0] === '`' && info.includes('`')) {
        return text;
    }

    const rest = body.slice(prefix.length);
    const close = rest.match(/(?:^|\n)[ \t]*(`{3,}|~{3,})[ \t]*$/);

    if (!close || close[1][0] !== markup[0] || close[1].length < markup.length) {
        return text;
    }

    return rest.slice(0, close.index).trim();
}

/**
 * Normalizes a translation cached by older CLI versions, which stored raw
 * model responses: strips markdown fences, converts a `<target>` echo into
 * the canonical `<source>` wrapper and restores a stripped wrapper.
 *
 * Returns the unit text unchanged when the cached value is not a
 * translation at all (the model echoed the source back) - callers treat
 * that as a cache miss so the unit gets retried.
 */
export function normalizeCached(unit: string, stored: string): string {
    let result = stripFence(stored.trim());

    if (unit.includes(SOURCE_OPEN)) {
        const target = result.match(/^<target(?:\s[^>]*)?>([\s\S]*)<\/target>$/);
        if (target) {
            result = target[1].trim();
        }

        if (!result.includes(SOURCE_OPEN)) {
            result = `<source xml:space="preserve">${result}</source>`;
        }
    }

    return result;
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
        rateLimitRetry,
        dryRun,
    } = config;

    const schedule = scheduler(maxConcurrency);
    // One gate per translator: a 429 from any request pauses all of them
    // until the rate limit window elapses.
    const gate = new RateGate();
    const marker = untranslatedMarker(sourceLanguage, targetLanguage);

    async function translateBatch(fragments: string[], context: string): Promise<string[]> {
        if (!fragments.length) {
            return [];
        }

        const wrappers = fragments.map(unwrapUnit);
        const messages = buildMessages(
            wrappers.map((wrapper) => wrapper.text),
            {
                systemPrompt,
                userPrompt,
                promptMode,
                sourceLanguage,
                targetLanguage,
                glossaryPairs,
                context,
            },
        );

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
            {rateLimitRetries: rateLimitRetry, gate},
        );

        stat.requests++;
        stat.bytes += bytes(fragments);
        if (result.usage) {
            stat.inputTokens += result.usage.inputTokens;
            stat.outputTokens += result.usage.outputTokens;
        }

        const parts = splitFragments(result.text);

        // Models sometimes emit stray edge delimiters (e.g. a lone separator
        // for a fragment they decided to keep as is) - empty edge parts are
        // framing noise, not translations.
        while (parts.length > fragments.length && parts[parts.length - 1] === '') {
            parts.pop();
        }
        while (parts.length > fragments.length && parts[0] === '') {
            parts.shift();
        }

        if (parts.length !== fragments.length) {
            throw new LLMResponseError(
                `Expected ${fragments.length} fragments in LLM response, got ${parts.length}`,
            );
        }

        // Restore the wrapper; unwrap defensively in case the model echoed it.
        // An empty translation of a non-empty fragment is never valid - keep
        // the source text instead (matches the built-in prompt rules).
        return parts.map((part, index) => {
            const {open, text, close} = wrappers[index];
            return open + (unwrapUnit(stripFence(part)).text || text) + close;
        });
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
            const batchTokens = bufferTokens;
            requests.push(
                schedule(async () => {
                    try {
                        if (!dryRun) {
                            logger.request(path, `${batch.length} units, ~${batchTokens} tokens`);
                        }
                        const translated = await translateWithFallback(path, batch, context);
                        translated.forEach((text, i) => {
                            if (!dryRun && text === batch[i] && marker?.test(text)) {
                                // The model returned source-script text unchanged.
                                // Keep it out of the store so the next run retries,
                                // and surface the miss in the stats.
                                stat.untranslated++;
                                logger.warn(path, 'Unit returned untranslated by the model.');
                                cache.get(batch[i])?.resolve(text);
                                return;
                            }
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
                const normalized = normalizeCached(text, stored);
                // Identity entries for units that still contain source-script
                // characters were cached by older runs that stored untranslated
                // responses. Treat them as misses so the unit gets another chance.
                const refused = normalized === text && marker !== null && marker.test(text);
                if (!refused) {
                    if (normalized !== stored) {
                        // Heal wrapper noise cached by older runs.
                        store?.set(text, normalized);
                    }
                    stat.cached++;
                    promises.push(Promise.resolve(normalized));
                    continue;
                }
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
