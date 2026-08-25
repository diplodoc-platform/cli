import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';

/**
 * Version of the run report schema. Bump it on any breaking change of the
 * report shape, so consumers (analytics pipelines, dashboards) can detect
 * incompatible reports instead of silently misreading them.
 */
export const TRANSLATE_REPORT_SCHEMA_VERSION = 1;

export type TranslateReportStatus = 'success' | 'partial' | 'failed';

export type TranslateReportError = {
    /** Target language the error occurred for, when known. */
    target?: string;
    /** Input-relative file path the error relates to, when known. */
    path?: string;
    /** Stable error code (TranslateError code) or UNKNOWN. */
    code: string;
    message: string;
};

export type TranslateReportJudge = {
    model: string;
    threshold: number;
    /** Number of scored source/translation pairs. */
    scored: number;
    averageScore: number;
    /** Pairs scored below the threshold. */
    belowThreshold: number;
    /** Pairs the judge failed to score (unparsable or failed batches). */
    unscored: number;
    /** Score histogram by decade: '0-9' ... '90-99' plus '100'. */
    distribution: Record<string, number>;
};

export type TranslateReportCounters = {
    files: {translated: number; failed: number; retried: number};
    units: {
        total: number;
        translated: number;
        fromCache: number;
        untranslated: number;
        oversized: number;
    };
    chars: {source: number; translated: number; request: number};
    /** Token usage as reported by the provider; null when not reported. */
    tokens: {input: number; output: number} | null;
    requests: {total: number; fallback: number; retries: number};
    cache: {enabled: boolean; hits: number; misses: number; hitRate: number | null};
};

export type TranslateReportTarget = TranslateReportCounters & {
    language: string;
    judge?: TranslateReportJudge;
};

export type TranslateRunReport = {
    schemaVersion: number;
    /** ISO 8601 start time of the CLI process. */
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    status: TranslateReportStatus;
    provider: string;
    model?: string;
    fallbackModel?: string;
    /** True when at least one request was served by the fallback model. */
    fallbackUsed: boolean;
    dryRun: boolean;
    sourceLanguage: string;
    targetLanguages: string[];
    files: {selected: number; skipped: number};
    totals: TranslateReportCounters;
    targets: TranslateReportTarget[];
    errors: TranslateReportError[];
};

/**
 * Mutable per-target counters incremented by providers at the points
 * where the events already happen (request sent, cache hit, retry,
 * fallback, file failed). Mapped into the report schema by RunReport.
 */
export type TargetStat = {
    inputTokens: number;
    outputTokens: number;
    /** True when the provider returned token usage at least once. */
    usageSeen: boolean;
    requests: number;
    /** Characters actually sent in translation requests. */
    bytes: number;
    /** Units served from the persistent cache (including seeds). */
    cached: number;
    /** Units the enabled cache did not cover. */
    cacheMisses: number;
    cacheEnabled: boolean;
    /** Units returned by the model untranslated. */
    untranslated: number;
    fallbackRequests: number;
    /** Extra request attempts after retryable errors. */
    retries: number;
    unitsTotal: number;
    /** Units translated by the provider during this run. */
    translatedUnits: number;
    /** Units skipped as too big for a single request. */
    oversized: number;
    sourceChars: number;
    translatedChars: number;
    filesTranslated: number;
    filesFailed: number;
    filesRetried: number;
};

export function createTargetStat(): TargetStat {
    return {
        inputTokens: 0,
        outputTokens: 0,
        usageSeen: false,
        requests: 0,
        bytes: 0,
        cached: 0,
        cacheMisses: 0,
        cacheEnabled: false,
        untranslated: 0,
        fallbackRequests: 0,
        retries: 0,
        unitsTotal: 0,
        translatedUnits: 0,
        oversized: 0,
        sourceChars: 0,
        translatedChars: 0,
        filesTranslated: 0,
        filesFailed: 0,
        filesRetried: 0,
    };
}

/** Builds the full score histogram: '0-9' ... '90-99' plus exact '100'. */
export function scoreDistribution(scores: number[]): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (let low = 0; low < 100; low += 10) {
        distribution[`${low}-${low + 9}`] = 0;
    }
    distribution['100'] = 0;

    for (const score of scores) {
        const bucket =
            score >= 100
                ? '100'
                : `${Math.floor(score / 10) * 10}-${Math.floor(score / 10) * 10 + 9}`;
        distribution[bucket] += 1;
    }

    return distribution;
}

function round(value: number, digits: number): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

function targetCounters(stat: TargetStat): TranslateReportCounters {
    const lookups = stat.cached + stat.cacheMisses;

    return {
        files: {
            translated: stat.filesTranslated,
            failed: stat.filesFailed,
            retried: stat.filesRetried,
        },
        units: {
            total: stat.unitsTotal,
            translated: stat.translatedUnits,
            fromCache: stat.cached,
            untranslated: stat.untranslated,
            oversized: stat.oversized,
        },
        chars: {
            source: stat.sourceChars,
            translated: stat.translatedChars,
            request: stat.bytes,
        },
        tokens: stat.usageSeen ? {input: stat.inputTokens, output: stat.outputTokens} : null,
        requests: {
            total: stat.requests,
            fallback: stat.fallbackRequests,
            retries: stat.retries,
        },
        cache: {
            enabled: stat.cacheEnabled,
            hits: stat.cached,
            misses: stat.cacheMisses,
            hitRate: stat.cacheEnabled && lookups > 0 ? round(stat.cached / lookups, 4) : null,
        },
    };
}

function sumCounters(targets: TranslateReportCounters[]): TranslateReportCounters {
    const totals = targetCounters(createTargetStat());
    const tokens = {input: 0, output: 0};
    let usageSeen = false;
    let cacheEnabled = false;
    let hits = 0;
    let misses = 0;

    for (const target of targets) {
        totals.files.translated += target.files.translated;
        totals.files.failed += target.files.failed;
        totals.files.retried += target.files.retried;
        totals.units.total += target.units.total;
        totals.units.translated += target.units.translated;
        totals.units.fromCache += target.units.fromCache;
        totals.units.untranslated += target.units.untranslated;
        totals.units.oversized += target.units.oversized;
        totals.chars.source += target.chars.source;
        totals.chars.translated += target.chars.translated;
        totals.chars.request += target.chars.request;
        totals.requests.total += target.requests.total;
        totals.requests.fallback += target.requests.fallback;
        totals.requests.retries += target.requests.retries;

        if (target.tokens) {
            usageSeen = true;
            tokens.input += target.tokens.input;
            tokens.output += target.tokens.output;
        }

        cacheEnabled = cacheEnabled || target.cache.enabled;
        hits += target.cache.hits;
        misses += target.cache.misses;
    }

    totals.tokens = usageSeen ? tokens : null;
    totals.cache = {
        enabled: cacheEnabled,
        hits,
        misses,
        hitRate: cacheEnabled && hits + misses > 0 ? round(hits / (hits + misses), 4) : null,
    };

    return totals;
}

type RunReportInfo = {
    provider: string;
    model?: string;
    fallbackModel?: string;
    dryRun: boolean;
    sourceLanguage: string;
    targetLanguages: string[];
    /** Absolute path to write the report to; the report is not written without it. */
    path?: AbsolutePath;
};

/**
 * Collects per-run translation statistics and produces the machine-readable
 * run report. Providers feed it with per-target counters and errors; the
 * report is finalized once and optionally written to `info.path`.
 */
export class RunReport {
    private readonly info: RunReportInfo;

    private files = {selected: 0, skipped: 0};

    private targets: TranslateReportTarget[] = [];

    private errors: TranslateReportError[] = [];

    private data: TranslateRunReport | null = null;

    constructor(info: RunReportInfo) {
        this.info = info;
    }

    setFiles(selected: number, skipped: number) {
        this.files = {selected, skipped};
    }

    addError(error: TranslateReportError) {
        this.errors.push(error);
    }

    addTarget(language: string, stat: TargetStat, judge?: TranslateReportJudge) {
        this.targets.push({
            language,
            ...targetCounters(stat),
            ...(judge ? {judge} : {}),
        });
    }

    /**
     * Computes the final report. Idempotent: the first call fixes the
     * result. Status is `failed` when passed explicitly (fatal error),
     * `partial` when the run completed with recorded errors, `success`
     * otherwise.
     */
    finalize(status?: 'failed'): TranslateRunReport {
        if (this.data) {
            return this.data;
        }

        const now = Date.now();
        const durationMs = Math.round(process.uptime() * 1000);
        const totals = sumCounters(this.targets);

        this.data = {
            schemaVersion: TRANSLATE_REPORT_SCHEMA_VERSION,
            startedAt: new Date(now - durationMs).toISOString(),
            finishedAt: new Date(now).toISOString(),
            durationMs,
            status: status || (this.errors.length ? 'partial' : 'success'),
            provider: this.info.provider,
            ...(this.info.model ? {model: this.info.model} : {}),
            ...(this.info.fallbackModel ? {fallbackModel: this.info.fallbackModel} : {}),
            fallbackUsed: totals.requests.fallback > 0,
            dryRun: this.info.dryRun,
            sourceLanguage: this.info.sourceLanguage,
            targetLanguages: this.info.targetLanguages,
            files: this.files,
            totals,
            targets: this.targets,
            errors: this.errors,
        };

        return this.data;
    }

    /** Writes the finalized report to the configured path. No-op without a path. */
    write() {
        if (!this.info.path || !this.data) {
            return;
        }

        mkdirSync(dirname(this.info.path), {recursive: true});
        writeFileSync(this.info.path, JSON.stringify(this.data, null, 2) + '\n');
    }

    /** One-line human-readable run summary for the log. */
    summary(): string {
        const data = this.finalize();
        const {totals} = data;
        const seconds = round(data.durationMs / 1000, 1);
        const cached =
            totals.cache.hitRate === null
                ? `${totals.units.fromCache} cached`
                : `${totals.units.fromCache} cached, ${round(totals.cache.hitRate * 100, 1)}% hit rate`;
        const tokens = totals.tokens
            ? `; tokens: ${totals.tokens.input} in / ${totals.tokens.output} out`
            : '';

        return (
            `run ${data.status} in ${seconds}s; ` +
            `files: ${totals.files.translated} translated, ${totals.files.failed} failed; ` +
            `units: ${totals.units.total} (${cached}); ` +
            `chars: ${totals.chars.source} in / ${totals.chars.translated} out` +
            tokens +
            `; requests: ${totals.requests.total}` +
            ` (${totals.requests.fallback} fallback, ${totals.requests.retries} retries)` +
            `; errors: ${this.errors.length}`
        );
    }
}
