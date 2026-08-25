/* eslint-disable no-console -- the eval runner reports to the terminal by design */
import type {EvalThresholds, GlossaryPair, JudgeSummary, PageResult} from './types';

import {ok} from 'node:assert';
import {spawn} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

import {checkGlossary} from './glossary';
import {compareMarkup} from './markup';
import {findUntranslatedLines, sourceScriptMarker} from './segments';
import {referenceSimilarity} from './similarity';
import {listCorpusPages, loadGlossaryPairs} from './corpus';
import {CAPTURE_USER_PROMPT, buildTranslationMemory} from './mock';
import {startCaptureServer, startMockServer} from './server';
import {DEFAULT_THRESHOLDS, buildReport, renderReport} from './report';

const GLOSSARY_FILENAME = 'glossary.yaml';
const MOCK_MODEL = 'eval-mock';

/**
 * Token budget per LLM request. Above the default: corpus pages contain
 * large single units (grid tables), and a unit that exceeds the budget
 * is skipped by translate entirely.
 */
const MAX_BATCH_TOKENS = 8000;

export type EvalCliArgs = {
    corpus: string;
    cli: string;
    workdir?: string;
    report?: string;
    source: string;
    target: string;
    real: boolean;
    judge: boolean;
    provider: string;
    model?: string;
    judgeModel?: string;
    auth?: string;
    apiBase?: string;
    folder?: string;
    thresholds: EvalThresholds;
};

type StringOption =
    | 'corpus'
    | 'cli'
    | 'workdir'
    | 'report'
    | 'source'
    | 'target'
    | 'provider'
    | 'model'
    | 'judgeModel'
    | 'auth'
    | 'apiBase'
    | 'folder';

const STRING_OPTIONS: Record<string, StringOption> = {
    '--corpus': 'corpus',
    '--cli': 'cli',
    '--workdir': 'workdir',
    '--report': 'report',
    '--source': 'source',
    '--target': 'target',
    '--provider': 'provider',
    '--model': 'model',
    '--judge-model': 'judgeModel',
    '--auth': 'auth',
    '--api-base': 'apiBase',
    '--folder': 'folder',
};

const THRESHOLD_OPTIONS: Record<string, keyof EvalThresholds> = {
    '--max-markup-violations': 'maxMarkupViolations',
    '--max-glossary-violations': 'maxGlossaryViolations',
    '--max-untranslated': 'maxUntranslated',
    '--min-judge-score': 'minJudgeScore',
    '--min-similarity': 'minSimilarity',
};

/**
 * Parses process argv into eval options. Hand-rolled on purpose: the
 * harness must stay independent from the CLI internals it evaluates.
 */
export function parseArgs(argv: string[]): EvalCliArgs {
    const args: EvalCliArgs = {
        corpus: 'tests/eval/corpus',
        cli: 'build/index.js',
        source: 'ru-RU',
        target: 'en-US',
        real: false,
        judge: true,
        provider: 'openai',
        thresholds: {...DEFAULT_THRESHOLDS},
    };

    const takeValue = (name: string, index: number): string => {
        const value = argv[index];
        ok(value !== undefined, `Option ${name} requires a value`);
        return value;
    };

    for (let index = 0; index < argv.length; index++) {
        const name = argv[index];

        if (name === '--real') {
            args.real = true;
        } else if (name === '--no-judge') {
            args.judge = false;
        } else if (STRING_OPTIONS[name]) {
            args[STRING_OPTIONS[name]] = takeValue(name, ++index);
        } else if (THRESHOLD_OPTIONS[name]) {
            args.thresholds[THRESHOLD_OPTIONS[name]] = Number(takeValue(name, ++index));
        } else {
            ok(false, `Unknown option: ${name}`);
        }
    }

    return args;
}

function language(locale: string): string {
    return locale.split('-')[0];
}

function run(
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
async function captureUnits(
    cli: string,
    corpus: string,
    workdir: string,
    source: string,
    target: string,
): Promise<Map<string, string[]>> {
    const server = await startCaptureServer();

    try {
        const result = await run(
            'node',
            [
                cli,
                'translate',
                '-i',
                corpus,
                '-o',
                join(workdir, `capture-${language(source)}`),
                '--source',
                source,
                '--target',
                target,
                '--provider',
                'openai',
                '--model',
                'eval-capture',
                '--auth',
                'eval-capture-token',
                '--api-base',
                server.apiBase,
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
            ],
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
function realProviderArgs(args: EvalCliArgs): string[] {
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
function evaluatePages(params: EvaluatePagesParams): PageResult[] {
    const {pages, corpus, output, sourceLang, targetLang, glossaryPairs, lowByPage} = params;
    const marker = sourceScriptMarker(sourceLang, targetLang);

    return pages.map((page) => {
        const judgeLow = lowByPage?.get(`${sourceLang}/${page}`) || 0;
        const translatedFile = join(output, targetLang, page);

        if (!existsSync(translatedFile)) {
            return {
                page,
                markupViolations: [
                    {type: 'missing-output', detail: 'translated file was not produced'},
                ],
                glossaryViolations: [],
                untranslated: [],
                similarity: 0,
                judgeLow,
            };
        }

        const sourceText = readFileSync(join(corpus, sourceLang, page), 'utf8');
        const referenceText = readFileSync(join(corpus, targetLang, page), 'utf8');
        const translatedText = readFileSync(translatedFile, 'utf8');

        return {
            page,
            markupViolations: compareMarkup(sourceText, translatedText),
            glossaryViolations: checkGlossary(sourceText, translatedText, glossaryPairs),
            untranslated: findUntranslatedLines(translatedText, referenceText, marker),
            similarity: referenceSimilarity(translatedText, referenceText),
            judgeLow,
        };
    });
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

function readJudgeSummary(
    file: string,
): {judge: JudgeSummary; lowByPage: Map<string, number>} | null {
    if (!existsSync(file)) {
        return null;
    }

    const quality = JSON.parse(readFileSync(file, 'utf8')) as QualityReport;
    const lowByPage = new Map<string, number>();

    for (const segment of quality.segments || []) {
        lowByPage.set(segment.path, (lowByPage.get(segment.path) || 0) + 1);
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

export async function main(argv: string[]): Promise<number> {
    const args = parseArgs(argv);

    const corpus = resolve(args.corpus);
    const cli = resolve(args.cli);
    const workdir = args.workdir
        ? resolve(args.workdir)
        : mkdtempSync(join(tmpdir(), 'yfm-translate-eval-'));
    const output = join(workdir, 'out');
    const reportFile = args.report ? resolve(args.report) : join(workdir, 'eval-report.json');

    ok(existsSync(cli), `CLI binary not found: ${cli}. Run \`npm run build\` first.`);

    const sourceLang = language(args.source);
    const targetLang = language(args.target);
    const pages = listCorpusPages(corpus, sourceLang, targetLang);
    const glossaryFile = join(corpus, GLOSSARY_FILENAME);
    const glossaryPairs = loadGlossaryPairs(glossaryFile);

    console.log(`Eval workdir: ${workdir}`);
    console.log(
        `Corpus: ${corpus} (${pages.length} pages, ${glossaryPairs.length} glossary terms)`,
    );

    const extraFailures: string[] = [];
    let mockMisses: string[] = [];

    const translateArgs = [
        cli,
        'translate',
        '-i',
        corpus,
        '-o',
        output,
        '--source',
        args.source,
        '--target',
        args.target,
        '--glossary',
        GLOSSARY_FILENAME,
        '--temperature',
        '0',
        '--max-batch-tokens',
        String(MAX_BATCH_TOKENS),
    ];

    if (args.judge) {
        translateArgs.push('--judge', '--judge-threshold', String(args.thresholds.minJudgeScore));
        if (args.judgeModel) {
            translateArgs.push('--judge-model', args.judgeModel);
        }
    }

    let closeServer: (() => Promise<void>) | undefined;
    let model: string;

    if (args.real) {
        model = args.model || `(${args.provider} default)`;
        translateArgs.push(...realProviderArgs(args));
    } else {
        // Mock mode: capture the exact translation units of both corpus
        // sides through the real pipeline, pair them positionally per
        // file and serve the result over a local OpenAI-compatible
        // endpoint. No network access, no credentials.
        console.log('Capturing corpus translation units...');
        const sourceUnits = await captureUnits(cli, corpus, workdir, args.source, args.target);
        const referenceUnits = await captureUnits(cli, corpus, workdir, args.target, args.source);

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

        const memory = buildTranslationMemory(sourceUnits, referenceUnits, (file) =>
            file.split('/').slice(1).join('/'),
        );

        console.log(`Translation memory: ${memory.size} unit pairs`);
        for (const mismatch of memory.mismatched) {
            console.warn(`Warning: cannot pair units of ${mismatch}`);
        }
        if (memory.mismatched.length) {
            extraFailures.push(
                `unit-misaligned corpus pages: ${memory.mismatched.length} ` +
                    '(see warnings above; align the reference with the source)',
            );
        }

        const server = await startMockServer(memory.lookup);
        closeServer = server.close;

        model = MOCK_MODEL;
        translateArgs.push(
            '--provider',
            'openai',
            '--model',
            MOCK_MODEL,
            '--auth',
            'eval-mock-token',
            '--api-base',
            server.apiBase,
            '--retry',
            '1',
            '--rate-limit-retry',
            '0',
        );

        mockMisses = server.stats.misses;
    }

    let translateCode: number;
    try {
        const translate = await run('node', translateArgs);
        translateCode = translate.code;
    } finally {
        await closeServer?.();
    }

    if (!args.real && mockMisses.length) {
        extraFailures.push(
            `translation memory misses: ${mockMisses.length} ` +
                '(source and reference pages are not unit-aligned)',
        );
        for (const miss of mockMisses.slice(0, 10)) {
            console.warn(`  TM miss: ${miss}`);
        }
    }

    ok(translateCode === 0, `\`yfm translate\` failed with code ${translateCode}`);

    const judgeData = args.judge
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

    if (args.judge && !judgeData) {
        extraFailures.push('judge report was not produced');
    }

    const report = buildReport({
        corpus,
        sourceLanguage: args.source,
        targetLanguage: args.target,
        mode: args.real ? 'real' : 'mock',
        model,
        pages: results,
        judge: judgeData?.judge || null,
        thresholds: args.thresholds,
        extraFailures,
    });

    writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');

    console.log('');
    console.log(renderReport(report));
    console.log('');
    console.log(`JSON report: ${reportFile}`);

    return report.passed ? 0 : 1;
}
