import type {Logger} from '~/core/logger';
import type {CodeMode} from '../../utils';
import type {TranslateConfig} from '~/commands/translate';
import type {AITranslationConfig} from './index';
import type {CompletionResult, LLMClient} from './clients/types';
import type {MarkupRepair} from './utils';
import type {JudgePair} from './judge';
import type {TargetStat, TranslateReportJudge} from '../../report';

import {writeFile} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';
import {asyncify, eachLimit} from 'async';

import {LogLevel} from '~/core/logger';
import {isFenceClose, matchFenceOpen} from '~/core/utils';

import {TranslateError, compose, languageRepath, loadTranslationUnits} from '../../utils';
import {TranslateLogger} from '../../logger';
import {RunReport, createTargetStat, reportError, scoreDistribution} from '../../report';

import {
    Defer,
    LLMAuthError,
    LLMResponseError,
    RateGate,
    SeedStore,
    TranslationStore,
    backoff,
    bytes,
    cacheFingerprint,
    estimateTokens,
    fallbackClientConfig,
    keepsMarkup,
    seedFilePath,
    stripAddedMarkup,
} from './utils';
import {DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT, buildMessages, splitFragments} from './prompts';
import {untranslatedMarker} from './utils/script';
import {judgeTranslations} from './judge';

export {untranslatedMarker};

const SOURCE_PREVIEW_LIMIT = 80;

const onFatalError = () => {
    process.exit(1);
};

export type ClientFactory = (config: AITranslationConfig) => LLMClient;

export class Provider {
    readonly logger: TranslateLogger;

    private readonly clientFactory: ClientFactory;

    private report?: RunReport;

    private skippedFiles = 0;

    constructor(clientFactory: ClientFactory, config: TranslateConfig) {
        this.clientFactory = clientFactory;
        this.logger = new TranslateLogger(config);
    }

    pipe(logger: Logger) {
        this.logger.pipe(logger);
    }

    async skip(skipped: [string, string][]) {
        this.skippedFiles = skipped.length;
        this.logger.skipped(skipped);
    }

    async translate(files: string[], config: AITranslationConfig) {
        const client = this.clientFactory(config);
        const fallbackClient = config.fallbackModel
            ? this.clientFactory(fallbackClientConfig(config))
            : undefined;
        const {input, output, source, target: targets, vars, dryRun, maxConcurrency} = config;

        this.report = RunReport.start(config, files.length, this.skippedFiles);

        try {
            for (const target of targets) {
                const cache = new Map<string, Defer>();
                const stat = createTargetStat();
                const store = makeStore(client, config, source.language, target.language);

                stat.cacheEnabled = Boolean(store);
                store?.load();

                const translate = makeTranslator({
                    client,
                    fallbackClient,
                    config,
                    sourceLanguage: source.language,
                    targetLanguage: target.language,
                    cache,
                    store,
                    stat,
                    logger: this.logger,
                });

                const pairs: JudgePair[] = [];
                const collect = config.judge && !dryRun ? makeJudgeCollector(pairs) : undefined;

                const processFile = makeProcessor({
                    input,
                    output,
                    sourceLanguage: source.language,
                    targetLanguage: target.language,
                    vars,
                    code: config.code,
                    translate,
                    onTranslated: collect,
                });

                await this.processFiles({
                    files,
                    maxConcurrency,
                    dryRun,
                    store,
                    processFile,
                    stat,
                    target: target.language,
                });

                store?.flush();

                this.logger.stat(
                    `requests: ${stat.requests} input-tokens: ${stat.inputTokens} ` +
                        `output-tokens: ${stat.outputTokens} bytes: ${stat.bytes} ` +
                        `cached-units: ${stat.cached} untranslated-units: ${stat.untranslated}` +
                        (fallbackClient ? ` fallback-requests: ${stat.fallbackRequests}` : '') +
                        (stat.markupStripped
                            ? ` added-markup-stripped: ${stat.markupStripped}`
                            : '') +
                        (stat.markupRetried
                            ? ` damaged-markup-retried: ${stat.markupRetried}` +
                              ` damaged-markup-kept: ${stat.markupDamaged}`
                            : '') +
                        (stat.untranslatedRetried
                            ? ` untranslated-retried: ${stat.untranslatedRetried}` +
                              ` untranslated-kept: ${stat.untranslatedKept}`
                            : ''),
                );

                const judge = pairs.length
                    ? await this.judge(pairs, config, source.language, target.language)
                    : undefined;

                this.report.addTarget(target.language, stat, judge);
            }

            this.report.close(this.logger);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            if (error instanceof TranslateError) {
                this.logger.topic(LogLevel.ERROR, error.code)(error.message);
            } else {
                this.logger.error(error);
            }
            this.report.addError(reportError(error));
            this.report.close(this.logger, 'failed');
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
        stat: TargetStat;
        target: string;
    }) {
        const {files, maxConcurrency, dryRun, store, processFile, stat, target} = params;
        const failed: string[] = [];

        const run = async (file: string, finalPass: boolean) => {
            try {
                this.logger.translate(file);
                await processFile(file);
                // Flush after every file to keep progress on crashes.
                store?.flush();
                stat.filesTranslated++;
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
                    stat.filesRetried++;
                    this.logger.warn(
                        file,
                        `${error.message}; the file will be retried after the main pass.`,
                    );
                    return;
                }
                this.reportFileError(file, error, stat, target);
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
    private reportFileError(file: string, error: any, stat: TargetStat, target: string) {
        stat.filesFailed++;
        this.report?.addError(reportError(error, {target, path: file}));

        if (error instanceof TranslateError) {
            this.logger.error(file, `${error.message}`, error.code);
            if (error.fatal) {
                this.report?.close(this.logger, 'failed');
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
    ): Promise<TranslateReportJudge> {
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

        return {
            model: config.judgeModel || config.model,
            threshold,
            scored: verdicts.length,
            averageScore: average,
            belowThreshold: low.length,
            unscored: skippedPairs,
            distribution: scoreDistribution(verdicts.map((verdict) => verdict.score)),
        };
    }
}

type ProcessorParams = {
    input: string;
    output: string;
    sourceLanguage: string;
    targetLanguage: string;
    vars: Hash;
    code: CodeMode;
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

/**
 * Collects source/translation pairs for the judge. Units the model left
 * untranslated are not scored: identity output is a miss, not a translation.
 */
function makeJudgeCollector(pairs: JudgePair[]) {
    return (path: string, units: string[], parts: string[]) => {
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
    };
}

function makeProcessor(params: ProcessorParams) {
    const {input, output, sourceLanguage, targetLanguage, vars, code, translate, onTranslated} =
        params;
    const inputRoot = resolve(input);
    const outputRoot = resolve(output);

    return async function (path: string) {
        const ext = extname(path);
        if (!['.yaml', '.md'].includes(ext)) {
            return;
        }

        const inputPath = join(inputRoot, path);
        const outputPath = languageRepath({inputRoot, outputRoot, sourceLanguage, targetLanguage});

        const {content, units, skeleton, schemas, ajvOptions} = await loadTranslationUnits({
            inputPath,
            path,
            sourceLanguage,
            targetLanguage,
            vars,
            code,
        });

        if (!content.data || !units.length) {
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
    /** Client for --fallback-model, tried after the primary retries are exhausted. */
    fallbackClient?: LLMClient;
    config: AITranslationConfig;
    sourceLanguage: string;
    targetLanguage: string;
    cache: Map<string, Defer>;
    store?: TranslationStore;
    stat: TargetStat;
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
        // Only when configured, so existing caches survive the CLI update.
        ...(config.contextFiles?.length ? {contextFiles: config.contextFiles} : {}),
    });

    // Seeds derived from existing target files (see `yfm translate seed`)
    // are provider-agnostic and survive fingerprint changes by design.
    const seeds = new SeedStore(seedFilePath(config.cacheDir, sourceLanguage, targetLanguage));
    seeds.load();

    return new TranslationStore(file, fingerprint, seeds);
}

/**
 * Models occasionally wrap the whole response in a markdown code fence.
 * The fence is never part of the translation.
 *
 * Only a wrapper counts: the first line has to open a fence and the last
 * one has to close it. The model picks the flavour and the length itself
 * (a longer run when the payload contains fences of its own), so both
 * lines go through the shared CommonMark matchers.
 */
function stripFence(text: string): string {
    const body = text.trim();
    const firstBreak = body.indexOf('\n');

    if (firstBreak === -1) {
        return text;
    }

    const fence = matchFenceOpen(body.slice(0, firstBreak));

    if (!fence) {
        return text;
    }

    const rest = body.slice(firstBreak + 1);
    const lastBreak = rest.lastIndexOf('\n');

    if (!isFenceClose(rest.slice(lastBreak + 1).trimStart(), fence.markup)) {
        return text;
    }

    return rest.slice(0, lastBreak + 1).trim();
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

export type CachedRepair = MarkupRepair & {
    /** The stored value with its wrapper normalized, markup untouched. */
    normalized: string;
};

/**
 * Prepares a cached translation for reuse: normalizes the wrapper and cuts
 * markup added around the fragment. Cache entries are also seeded from
 * files already in the repository, so a defect merged once would otherwise
 * be replayed by every next run.
 *
 * The markup repair stays out of the store on purpose. Only the wrapper
 * normalization is worth writing back; a repaired value written back would
 * be repaired again next run, from a different starting point, and the
 * output file would drift between runs of the same input.
 */
export function healCached(unit: string, stored: string): CachedRepair {
    const normalized = normalizeCached(unit, stored);
    const {open, text, close} = unwrapUnit(normalized);
    const source = unwrapUnit(unit).text;
    const repair = stripAddedMarkup(source, text);

    // There is no retry on this path, so a repair that would leave markup
    // which cannot be composed has nowhere to go: keep the cached value.
    if (repair.stripped && keepsMarkup(source, text) && !keepsMarkup(source, repair.text)) {
        return {text: normalized, normalized, stripped: 0};
    }

    return {text: open + repair.text + close, normalized, stripped: repair.stripped};
}

export function makeTranslator(params: TranslatorParams): Translate {
    const {
        client,
        fallbackClient,
        config,
        sourceLanguage,
        targetLanguage,
        cache,
        store,
        stat,
        logger,
    } = params;
    const {
        systemPrompt,
        userPrompt,
        promptMode,
        glossaryPairs,
        contextFiles,
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
    // until the rate limit window elapses. The fallback model has its own
    // quota, so its requests must not hold on the primary rate limit window.
    const gate = new RateGate();
    const fallbackGate = new RateGate();
    // The clients drop `temperature` when the model refuses it. Running at a
    // different temperature than configured must not go unnoticed, but it is
    // worth saying once per target, not once per request.
    let temperatureWarned = false;
    const marker = untranslatedMarker(sourceLanguage, targetLanguage);
    // Units the model kept returning with damaged markup: they fall back to
    // their source text and must stay out of the store, so the next run
    // gets another chance at them.
    const damaged = new Set<string>();
    // Markers cut from the answer currently held for a unit. A retry
    // overwrites the entry, so a repair on an answer that was thrown away
    // never reaches the report.
    const repairs = new Map<string, number>();

    async function translateBatch(
        path: string,
        fragments: string[],
        context: string,
    ): Promise<string[]> {
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
                contextFiles,
                context,
            },
        );

        if (dryRun) {
            const inputTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
            stat.inputTokens += inputTokens;
            stat.outputTokens += fragments.reduce((sum, f) => sum + estimateTokens(f), 0);
            // Dry-run tokens are estimates, but they are the point of the
            // mode (quota planning) - surface them in the report too.
            stat.usageSeen = true;
            stat.requests++;
            stat.bytes += bytes(fragments);
            return fragments;
        }

        // Every attempt after the first one is a retry, on success and on
        // final failure alike - count them where the requests happen.
        const counted = <T>(action: () => Promise<T>) => {
            let attempts = 0;
            return () => {
                if (attempts++) {
                    stat.retries++;
                }
                return action();
            };
        };

        let result: CompletionResult;
        try {
            result = await backoff(
                counted(() => client.complete(messages, {temperature, maxTokens: maxOutputTokens})),
                retry,
                {rateLimitRetries: rateLimitRetry, gate},
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            // Auth errors are fatal and shared with the fallback client:
            // the same credentials would fail again.
            if (!fallbackClient || error instanceof LLMAuthError) {
                throw error;
            }
            logger.warn(
                path,
                `Primary model failed (${error.message}); retrying with the fallback model.`,
            );
            result = await backoff(
                counted(() =>
                    fallbackClient.complete(messages, {temperature, maxTokens: maxOutputTokens}),
                ),
                retry,
                {rateLimitRetries: rateLimitRetry, gate: fallbackGate},
            );
            stat.fallbackRequests++;
        }

        if (
            !temperatureWarned &&
            (client.temperatureDropped || fallbackClient?.temperatureDropped)
        ) {
            temperatureWarned = true;
            logger.warn(
                path,
                'The model refused the configured temperature; requests continue without it.',
            );
        }

        stat.requests++;
        stat.bytes += bytes(fragments);
        if (result.usage) {
            stat.usageSeen = true;
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
            const translation = unwrapUnit(stripFence(part)).text || text;
            const repair = stripAddedMarkup(text, translation);

            // Counted only once the answer is kept: a retry replaces both
            // the text and its repair.
            repairs.set(fragments[index], repair.stripped);

            return open + repair.text + close;
        });
    }

    /**
     * Asks the model again for the fragments the repair could not save.
     * Never throws: the main response is already in hand, so a failed
     * repair attempt must not fail the file, and a batch the model answers
     * with the wrong number of fragments is split, exactly like the main
     * request - otherwise one malformed answer sends the whole set back to
     * its source text.
     */
    async function retryFragments(
        path: string,
        fragments: string[],
        context: string,
        what: string,
    ): Promise<(string | undefined)[]> {
        try {
            return await translateBatch(path, fragments, context);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            logger.warn(path, `${what} failed (${error.message}).`);

            // Only a malformed answer is worth splitting; a rate limit or a
            // server error would meet every fragment the same way.
            if (!(error instanceof LLMResponseError) || fragments.length < 2) {
                return [];
            }
        }

        const result: (string | undefined)[] = [];

        for (const fragment of fragments) {
            try {
                result.push((await translateBatch(path, [fragment], context))[0]);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                logger.warn(path, `${what} failed (${error.message}).`);
                result.push(undefined);
            }
        }

        return result;
    }

    /**
     * Retranslates the fragments whose markup the repair could not save:
     * a placeholder the model dropped without writing its marker in place
     * loses the formatting or leaves an unpaired delimiter in the line.
     *
     * One more request is cheaper than a broken line, and a fragment the
     * retry does not fix keeps its source text: untranslated composes
     * cleanly, damaged markup does not.
     */
    async function repairDamaged(
        path: string,
        fragments: string[],
        parts: string[],
        context: string,
    ): Promise<string[]> {
        if (dryRun) {
            return parts;
        }

        const kept = (fragment: string, part: string) =>
            keepsMarkup(unwrapUnit(fragment).text, unwrapUnit(part).text);
        const indexes = fragments
            .map((_, index) => index)
            .filter((index) => !kept(fragments[index], parts[index]));

        if (!indexes.length) {
            return parts;
        }

        stat.markupRetried += indexes.length;
        logger.warn(
            path,
            `${indexes.length} fragment(s) came back with damaged markup; retrying them.`,
        );

        const retried = await retryFragments(
            path,
            indexes.map((index) => fragments[index]),
            context,
            'Markup retry',
        );

        const result = [...parts];
        let unfixed = 0;

        indexes.forEach((index, position) => {
            const candidate = retried[position];

            if (candidate !== undefined && kept(fragments[index], candidate)) {
                result[index] = candidate;
                return;
            }

            unfixed++;
            stat.markupDamaged++;
            damaged.add(fragments[index]);
            repairs.set(fragments[index], 0);
            result[index] = fragments[index];
        });

        if (unfixed) {
            logger.warn(
                path,
                `${unfixed} fragment(s) stayed damaged after the retry; keeping their source text.`,
            );
        }

        return result;
    }

    /**
     * Re-requests the fragments the model returned unchanged, in the
     * source language. The same prompt in a request of its own is enough
     * to fix most of them, and a request that mentions the failed attempt
     * is not: describing the echo to the model reproduces it - see
     * docs/specs/2026-09-16-translate-untranslated-units-design.md for the
     * numbers.
     *
     * A fragment that comes back untranslated again keeps its source text
     * and is counted by the caller.
     */
    async function retryUntranslated(
        path: string,
        fragments: string[],
        parts: string[],
        context: string,
    ): Promise<string[]> {
        if (dryRun || marker === null) {
            return parts;
        }

        // Bound after the guard, so the closures below need no narrowing
        // of the captured `marker`. Named `sourceScript` (not `script`) to
        // read clearly next to `scriptsOf()`.
        const sourceScript: RegExp = marker;

        const refused = (fragment: string, part: string | undefined) =>
            part !== undefined && part === fragment && sourceScript.test(part);

        const indexes = fragments
            .map((_, index) => index)
            .filter((index) => refused(fragments[index], parts[index]));

        if (!indexes.length) {
            return parts;
        }

        // A retried fragment can still end up under the markup counters:
        // if the retry answer arrives with damaged markup that the repair
        // cannot save, the fragment falls back to its source text there.
        stat.untranslatedRetried += indexes.length;
        logger.warn(path, `${indexes.length} fragment(s) came back untranslated; retrying them.`);

        const retried = await retryFragments(
            path,
            indexes.map((index) => fragments[index]),
            context,
            'Untranslated retry',
        );

        const result = [...parts];

        // Acceptance mirrors the rule that triggered the retry: anything
        // but the same echo counts as a translation. A stricter rule -
        // rejecting any answer that still carries source-script text -
        // would throw away legitimate translations of pages that quote the
        // source language on purpose, and ship their source text instead.
        indexes.forEach((index, position) => {
            const candidate = retried[position];

            if (candidate !== undefined && !refused(fragments[index], candidate)) {
                result[index] = candidate;
            }
        });

        return result;
    }

    async function translateWithSplit(
        path: string,
        fragments: string[],
        context: string,
    ): Promise<string[]> {
        try {
            const parts = await translateBatch(path, fragments, context);
            const retried = await retryUntranslated(path, fragments, parts, context);

            return await repairDamaged(path, fragments, retried, context);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            if (error instanceof LLMResponseError && fragments.length > 1) {
                logger.warn(
                    path,
                    `Batch of ${fragments.length} fragments failed (${error.message}); retrying one-by-one.`,
                );
                const result: string[] = [];
                for (const fragment of fragments) {
                    const single = await translateBatch(path, [fragment], context);
                    const retried = await retryUntranslated(path, [fragment], single, context);
                    const repaired = await repairDamaged(path, [fragment], retried, context);
                    result.push(repaired[0]);
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
        const resolved = store ? store.resolve(path, texts) : [];
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
                        const translated = await translateWithSplit(path, batch, context);
                        translated.forEach((text, i) => {
                            stat.markupStripped += repairs.get(batch[i]) || 0;

                            if (damaged.has(batch[i])) {
                                // Fell back to the source text: counted as
                                // untranslated and kept out of the store.
                                stat.untranslated++;
                                cache.get(batch[i])?.resolve(text);
                                return;
                            }
                            if (!dryRun && text === batch[i] && marker?.test(text)) {
                                // The model returned source-script text unchanged
                                // and the retry did not fix it. Keep it out of the
                                // store so the next run tries again, and surface
                                // the miss in the stats.
                                stat.untranslated++;
                                stat.untranslatedKept++;
                                logger.warn(path, 'Unit returned untranslated by the model.');
                                cache.get(batch[i])?.resolve(text);
                                return;
                            }
                            stat.translatedUnits++;
                            stat.translatedChars += text.length;
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

        for (const [index, text] of texts.entries()) {
            const tokens = estimateTokens(text);

            stat.unitsTotal++;
            stat.sourceChars += text.length;

            if (tokens > maxBatchTokens) {
                logger.warn(
                    path,
                    `Skip document part for translation. Part is too big (~${tokens} tokens > ${maxBatchTokens}).`,
                );
                stat.oversized++;
                promises.push(Promise.resolve(text));
                continue;
            }

            const stored = resolved[index];
            if (stored !== undefined) {
                const {text: healed, normalized, stripped} = healCached(text, stored);
                // Identity entries for units that still contain source-script
                // characters were cached by older runs that stored untranslated
                // responses. Treat them as misses so the unit gets another chance.
                const refused = normalized === text && marker !== null && marker.test(text);
                if (!refused) {
                    if (normalized !== stored && !dryRun) {
                        // Heal wrapper noise cached by older runs. A dry run
                        // estimates, it does not rewrite.
                        store?.set(text, normalized);
                    }
                    stat.cached++;
                    stat.markupStripped += stripped;
                    promises.push(Promise.resolve(healed));
                    continue;
                }
            }

            if (store) {
                stat.cacheMisses++;
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
