import type {EvalReport, EvalThresholds, GlossaryPair, JudgeSummary, PageResult} from './types';

import {ok} from 'node:assert';
import {spawn} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

import {checkGlossary} from './glossary';
import {compareMarkup} from './markup';
import {findUntranslatedLines, sourceScriptMarker} from './segments';
import {referenceSimilarity} from './similarity';
import {listCorpusPages, loadGlossaryPairs} from './corpus';
import {CAPTURE_USER_PROMPT, buildTranslationMemory} from './mock';
import {startCaptureServer, startMockServer} from './server';
import {buildReport} from './report';

export const GLOSSARY_FILENAME = 'glossary.yaml';
const MOCK_MODEL = 'eval-mock';

/**
 * Token budget per LLM request. Above the default: corpus pages contain
 * large single units (grid tables), and a unit that exceeds the budget
 * is skipped by translate entirely.
 */
export const MAX_BATCH_TOKENS = 8000;

export function language(locale: string): string {
    return locale.split('-')[0];
}

export function run(
    command: string,
    commandArgs: string[],
    quiet = false,
): Promise<{code: number; output: string}> {
    return new Promise((done, fail) => {
        const child = spawn(command, commandArgs, {stdio: ['ignore', 'pipe', 'pipe']});
        let output = '';

        const consume = (chunk: Buffer) => {
            const text = chunk.toString();
            output += text;
            if (!quiet) {
                process.stdout.write(text);
            }
        };

        child.stdout.on('data', consume);
        child.stderr.on('data', consume);
        child.on('error', fail);
        child.on('exit', (code) => done({code: code ?? 1, output}));
    });
}

/**
 * Runs the corpus through translate against a local echo endpoint and
 * captures the exact translation units per file, in document order.
 *
 * `--max-concurrency 1` keeps the request order deterministic; the
 * capture prompt strips everything but the file context and the
 * fragments, so units are recovered verbatim.
 */
export async function captureUnits(params: {
    cli: string;
    corpus: string;
    workdir: string;
    source: string;
    target: string;
}): Promise<Map<string, string[]>> {
    const {cli, corpus, workdir, source, target} = params;
    const server = await startCaptureServer();

    try {
        const result = await run(
            'node',
            captureRunArgs({
                cli,
                corpus,
                output: join(workdir, `capture-${language(source)}`),
                source,
                target,
                apiBase: server.apiBase,
            }),
            true,
        );

        ok(
            result.code === 0,
            `Capture translate run for ${source} failed with code ${result.code}:\n${result.output}`,
        );
    } finally {
        await server.close();
    }

    return server.units;
}

/**
 * Provider flags passed through to `yfm translate` in real mode.
 */
export function realProviderArgs(args: {
    provider: string;
    model?: string;
    auth?: string;
    apiBase?: string;
    folder?: string;
}): string[] {
    const result = ['--provider', args.provider];

    const passthrough: [string, string | undefined][] = [
        ['--model', args.model],
        ['--auth', args.auth],
        ['--api-base', args.apiBase],
        ['--folder', args.folder],
    ];

    for (const [flag, value] of passthrough) {
        if (value) {
            result.push(flag, value);
        }
    }

    return result;
}

export type TranslateArgsParams = {
    cli: string;
    corpus: string;
    output: string;
    source: string;
    target: string;
    judge: boolean;
    judgeThreshold: number;
    judgeModel?: string;
};

/**
 * Base `yfm translate` invocation shared by mock and real modes.
 */
export function baseTranslateArgs(params: TranslateArgsParams): string[] {
    const result = [
        params.cli,
        'translate',
        '-i',
        params.corpus,
        '-o',
        params.output,
        '--source',
        params.source,
        '--target',
        params.target,
        '--glossary',
        GLOSSARY_FILENAME,
        '--temperature',
        '0',
        '--max-batch-tokens',
        String(MAX_BATCH_TOKENS),
    ];

    if (params.judge) {
        result.push('--judge', '--judge-threshold', String(params.judgeThreshold));
        if (params.judgeModel) {
            result.push('--judge-model', params.judgeModel);
        }
    }

    return result;
}

/**
 * `yfm translate` invocation of a capture run: a custom user prompt
 * that keeps only the file context and the fragments, sequential
 * requests for deterministic order.
 */
export function captureRunArgs(params: {
    cli: string;
    corpus: string;
    output: string;
    source: string;
    target: string;
    apiBase: string;
}): string[] {
    return [
        params.cli,
        'translate',
        '-i',
        params.corpus,
        '-o',
        params.output,
        '--source',
        params.source,
        '--target',
        params.target,
        '--provider',
        'openai',
        '--model',
        'eval-capture',
        '--auth',
        'eval-capture-token',
        '--api-base',
        params.apiBase,
        '--user-prompt',
        CAPTURE_USER_PROMPT,
        '--max-concurrency',
        '1',
        '--max-batch-tokens',
        String(MAX_BATCH_TOKENS),
        '--retry',
        '1',
        '--rate-limit-retry',
        '0',
    ];
}

/**
 * Provider flags of the mock mode: the local endpoint with fail-fast
 * retry settings.
 */
export function mockProviderArgs(apiBase: string): string[] {
    return [
        '--provider',
        'openai',
        '--model',
        MOCK_MODEL,
        '--auth',
        'eval-mock-token',
        '--api-base',
        apiBase,
        '--retry',
        '1',
        '--rate-limit-retry',
        '0',
    ];
}

type EvaluatePagesParams = {
    pages: string[];
    corpus: string;
    output: string;
    sourceLang: string;
    targetLang: string;
    glossaryPairs: GlossaryPair[];
    lowByPage?: Map<string, number>;
};

/**
 * Runs the deterministic checks over every corpus page.
 */
export function evaluatePages(params: EvaluatePagesParams): PageResult[] {
    const {pages, corpus, output, sourceLang, targetLang, glossaryPairs, lowByPage} = params;
    const marker = sourceScriptMarker(sourceLang, targetLang);

    return pages.map((page) => {
        const judgeLow = lowByPage?.get(`${sourceLang}/${page}`) || 0;
        const referenceFile = join(corpus, targetLang, page);
        const hasReference = existsSync(referenceFile);
        const translatedFile = join(output, targetLang, page);

        if (!existsSync(translatedFile)) {
            return {
                page,
                markupViolations: [
                    {type: 'missing-output', detail: 'translated file was not produced'},
                ],
                glossaryViolations: [],
                untranslated: hasReference ? [] : null,
                similarity: hasReference ? 0 : null,
                judgeLow,
            };
        }

        const sourceText = readFileSync(join(corpus, sourceLang, page), 'utf8');
        const translatedText = readFileSync(translatedFile, 'utf8');
        const referenceText = hasReference ? readFileSync(referenceFile, 'utf8') : null;

        return {
            page,
            markupViolations: compareMarkup(sourceText, translatedText),
            glossaryViolations: checkGlossary(sourceText, translatedText, glossaryPairs),
            untranslated:
                referenceText === null
                    ? null
                    : findUntranslatedLines(translatedText, referenceText, marker),
            similarity:
                referenceText === null ? null : referenceSimilarity(translatedText, referenceText),
            judgeLow,
        };
    });
}

/**
 * Drops the language directory from a capture file path. Paths inside
 * prompts follow the OS convention, so both separators are handled.
 */
export function stripLangPrefix(file: string): string {
    return file.split(/[\\/]/).slice(1).join('/');
}

type MockSetup = {
    model: string;
    args: string[];
    misses: string[];
    failures: string[];
    close: () => Promise<void>;
};

/**
 * Mock mode: captures the exact translation units of both corpus sides
 * through the real pipeline, pairs them positionally per file and
 * serves the result over a local OpenAI-compatible endpoint. No
 * network access, no credentials.
 */
async function setupMockProvider(params: {
    cli: string;
    corpus: string;
    workdir: string;
    source: string;
    target: string;
    sourceLang: string;
    targetLang: string;
    log: (message: string) => void;
}): Promise<MockSetup> {
    const {cli, corpus, workdir, source, target, sourceLang, targetLang, log} = params;
    const failures: string[] = [];

    log('Capturing corpus translation units...');
    const sourceUnits = await captureUnits({cli, corpus, workdir, source, target});
    // The reference side runs in the reverse direction: its pages are
    // the source of that capture.
    const referenceUnits = await captureUnits({
        cli,
        corpus,
        workdir,
        source: target,
        target: source,
    });

    // Keep the captured units on disk: aligning corpus pages is much
    // easier with both unit lists side by side.
    writeFileSync(
        join(workdir, 'units.json'),
        JSON.stringify(
            {
                [sourceLang]: Object.fromEntries(sourceUnits),
                [targetLang]: Object.fromEntries(referenceUnits),
            },
            null,
            2,
        ),
    );

    const memory = buildTranslationMemory(sourceUnits, referenceUnits, stripLangPrefix);

    log(`Translation memory: ${memory.size} unit pairs`);
    for (const mismatch of memory.mismatched) {
        log(`Warning: cannot pair units of ${mismatch}`);
    }
    if (memory.mismatched.length) {
        failures.push(
            `unit-misaligned corpus pages: ${memory.mismatched.length} ` +
                '(see warnings above; align the reference with the source)',
        );
    }

    const server = await startMockServer(memory.lookup);

    return {
        model: MOCK_MODEL,
        args: mockProviderArgs(server.apiBase),
        misses: server.stats.misses,
        failures,
        close: server.close,
    };
}

type QualityReport = {
    model: string;
    threshold: number;
    scored: number;
    skipped: {batches: number; pairs: number};
    averageScore: number;
    low: number;
    segments: {path: string; score: number}[];
};

export function readJudgeSummary(
    file: string,
): {judge: JudgeSummary; lowByPage: Map<string, number>} | null {
    if (!existsSync(file)) {
        return null;
    }

    const quality = JSON.parse(readFileSync(file, 'utf8')) as QualityReport;
    const lowByPage = new Map<string, number>();

    for (const segment of quality.segments || []) {
        // Judge paths follow the OS convention; normalize for lookups.
        const path = segment.path.replace(/\\/g, '/');
        lowByPage.set(path, (lowByPage.get(path) || 0) + 1);
    }

    return {
        judge: {
            model: quality.model,
            threshold: quality.threshold,
            scored: quality.scored,
            averageScore: quality.averageScore,
            low: quality.low,
            skippedPairs: quality.skipped?.pairs || 0,
        },
        lowByPage,
    };
}

export type EvalRunOptions = {
    corpus: string;
    cli: string;
    workdir: string;
    reportFile: string;
    source: string;
    target: string;
    real: boolean;
    judge: boolean;
    judgeModel?: string;
    provider: string;
    model?: string;
    auth?: string;
    apiBase?: string;
    folder?: string;
    /** Extra `--api-header "Name: value"` values. */
    apiHeaders?: string[];
    systemPrompt?: string;
    userPrompt?: string;
    /** Adds `--no-cache` to the translate invocation. */
    noCache?: boolean;
    /** Path for `yfm translate --report`. */
    runReport?: string;
    /** Fail when a corpus page has no reference translation. */
    requireReference?: boolean;
    thresholds: EvalThresholds;
    /** Progress log sink. */
    log?: (message: string) => void;
};

export type EvalRunResult = {
    report: EvalReport;
    workdir: string;
    /** Directory with the translated output, `<workdir>/out`. */
    output: string;
    reportFile: string;
    /**
     * Failures of the harness rather than of the translation: a
     * misaligned corpus, a missing judge report. A series repeats the
     * same corpus, so these must not be counted once per run.
     */
    harnessFailures: string[];
};

/**
 * Runs the corpus through `yfm translate` once and scores the result.
 * The eval CLI and the model benchmark are both thin wrappers around
 * this function.
 */
export async function runEval(options: EvalRunOptions): Promise<EvalRunResult> {
    /* eslint-disable-next-line no-console -- the default sink of a terminal tool */
    const log = options.log || ((message: string) => console.log(message));
    const corpus = resolve(options.corpus);
    const cli = resolve(options.cli);
    const workdir = resolve(options.workdir);
    const output = join(workdir, 'out');
    const reportFile = resolve(options.reportFile);

    ok(existsSync(cli), `CLI binary not found: ${cli}. Run \`npm run build\` first.`);

    const sourceLang = language(options.source);
    const targetLang = language(options.target);
    const pages = listCorpusPages(corpus, sourceLang, targetLang, {
        requireReference: options.requireReference !== false,
    });
    const glossaryPairs = loadGlossaryPairs(join(corpus, GLOSSARY_FILENAME));

    log(`Eval workdir: ${workdir}`);
    log(`Corpus: ${corpus} (${pages.length} pages, ${glossaryPairs.length} glossary terms)`);

    const extraFailures: string[] = [];
    let mockMisses: string[] = [];

    const translateArgs = baseTranslateArgs({
        cli,
        corpus,
        output,
        source: options.source,
        target: options.target,
        judge: options.judge,
        judgeThreshold: options.thresholds.minJudgeScore,
        judgeModel: options.judgeModel,
    });

    if (options.noCache) {
        translateArgs.push('--no-cache');
    }
    if (options.runReport) {
        translateArgs.push('--report', resolve(options.runReport));
    }
    for (const header of options.apiHeaders || []) {
        translateArgs.push('--api-header', header);
    }
    if (options.systemPrompt) {
        translateArgs.push('--system-prompt', options.systemPrompt);
    }
    if (options.userPrompt) {
        translateArgs.push('--user-prompt', options.userPrompt);
    }

    let closeServer: (() => Promise<void>) | undefined;
    let model: string;

    if (options.real) {
        model = options.model || `(${options.provider} default)`;
        translateArgs.push(...realProviderArgs(options));
    } else {
        const mock = await setupMockProvider({
            cli,
            corpus,
            workdir,
            source: options.source,
            target: options.target,
            sourceLang,
            targetLang,
            log,
        });
        model = mock.model;
        closeServer = mock.close;
        mockMisses = mock.misses;
        extraFailures.push(...mock.failures);
        translateArgs.push(...mock.args);
    }

    let translateCode: number;
    try {
        const translate = await run('node', translateArgs);
        translateCode = translate.code;
    } finally {
        await closeServer?.();
    }

    if (!options.real && mockMisses.length) {
        extraFailures.push(
            `translation memory misses: ${mockMisses.length} ` +
                '(source and reference pages are not unit-aligned)',
        );
        for (const miss of mockMisses.slice(0, 10)) {
            log(`  TM miss: ${miss}`);
        }
    }

    ok(translateCode === 0, `\`yfm translate\` failed with code ${translateCode}`);

    const judgeData = options.judge
        ? readJudgeSummary(join(output, `translate-quality.${targetLang}.json`))
        : null;

    const results = evaluatePages({
        pages,
        corpus,
        output,
        sourceLang,
        targetLang,
        glossaryPairs,
        lowByPage: judgeData?.lowByPage,
    });

    if (options.judge && !judgeData) {
        extraFailures.push('judge report was not produced');
    }

    const report = buildReport({
        corpus,
        sourceLanguage: options.source,
        targetLanguage: options.target,
        mode: options.real ? 'real' : 'mock',
        model,
        pages: results,
        judge: judgeData?.judge || null,
        thresholds: options.thresholds,
        extraFailures,
    });

    writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');

    return {report, workdir, output, reportFile, harnessFailures: extraFailures};
}
