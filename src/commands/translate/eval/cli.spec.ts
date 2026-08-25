import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {DEFAULT_THRESHOLDS} from './report';
import {
    baseTranslateArgs,
    captureRunArgs,
    evaluatePages,
    main,
    mockProviderArgs,
    parseArgs,
    readJudgeSummary,
    realProviderArgs,
} from './cli';

function write(root: string, path: string, content: string) {
    const target = join(root, path);
    mkdirSync(join(target, '..'), {recursive: true});
    writeFileSync(target, content);
}

describe('translate eval cli', () => {
    describe('parseArgs', () => {
        it('should apply defaults', () => {
            const args = parseArgs([]);

            expect(args.corpus).toBe('tests/eval/corpus');
            expect(args.source).toBe('ru-RU');
            expect(args.target).toBe('en-US');
            expect(args.real).toBe(false);
            expect(args.judge).toBe(true);
            expect(args.thresholds).toEqual(DEFAULT_THRESHOLDS);
        });

        it('should parse string options, flags and thresholds', () => {
            const args = parseArgs([
                '--corpus',
                '/corpus',
                '--model',
                'gpt-4o',
                '--real',
                '--no-judge',
                '--max-untranslated',
                '5',
                '--min-similarity',
                '0.5',
            ]);

            expect(args.corpus).toBe('/corpus');
            expect(args.model).toBe('gpt-4o');
            expect(args.real).toBe(true);
            expect(args.judge).toBe(false);
            expect(args.thresholds.maxUntranslated).toBe(5);
            expect(args.thresholds.minSimilarity).toBe(0.5);
        });

        it('should reject unknown options and missing values', () => {
            expect(() => parseArgs(['--bogus'])).toThrow(/Unknown option/);
            expect(() => parseArgs(['--model'])).toThrow(/requires a value/);
        });
    });

    describe('realProviderArgs', () => {
        it('should pass through only the provided provider options', () => {
            const args = parseArgs(['--provider', 'anthropic', '--model', 'claude', '--auth', 'k']);

            expect(realProviderArgs(args)).toEqual([
                '--provider',
                'anthropic',
                '--model',
                'claude',
                '--auth',
                'k',
            ]);
        });
    });

    describe('translate invocation builders', () => {
        const base = {
            cli: '/cli/index.js',
            corpus: '/corpus',
            output: '/out',
            source: 'ru-RU',
            target: 'en-US',
        };

        it('should build the base translate command with judge flags', () => {
            const args = baseTranslateArgs({
                ...base,
                judge: true,
                judgeThreshold: 80,
                judgeModel: 'judge-1',
            });

            expect(args.slice(0, 2)).toEqual(['/cli/index.js', 'translate']);
            expect(args).toContain('--glossary');
            expect(args).toContain('--judge');
            expect(args).toContain('80');
            expect(args).toContain('judge-1');
        });

        it('should omit judge flags when the judge is disabled', () => {
            const args = baseTranslateArgs({...base, judge: false, judgeThreshold: 70});

            expect(args).not.toContain('--judge');
            expect(args).not.toContain('--judge-model');
        });

        it('should build a sequential capture run against the echo endpoint', () => {
            const args = captureRunArgs({...base, apiBase: 'http://127.0.0.1:1/v1'});

            expect(args).toContain('--user-prompt');
            expect(args).toContain('http://127.0.0.1:1/v1');
            expect(args.slice(args.indexOf('--max-concurrency'))[1]).toBe('1');
            expect(args).not.toContain('--judge');
        });

        it('should point the mock provider at the local endpoint', () => {
            const args = mockProviderArgs('http://127.0.0.1:2/v1');

            expect(args).toEqual([
                '--provider',
                'openai',
                '--model',
                'eval-mock',
                '--auth',
                'eval-mock-token',
                '--api-base',
                'http://127.0.0.1:2/v1',
                '--retry',
                '1',
                '--rate-limit-retry',
                '0',
            ]);
        });
    });

    describe('readJudgeSummary', () => {
        it('should read the quality report and index low segments by page', () => {
            const root = mkdtempSync(join(tmpdir(), 'eval-cli-spec-'));
            const file = join(root, 'translate-quality.en.json');
            writeFileSync(
                file,
                JSON.stringify({
                    model: 'judge-model',
                    threshold: 70,
                    scored: 10,
                    skipped: {batches: 0, pairs: 2},
                    averageScore: 88,
                    low: 2,
                    segments: [
                        {path: 'ru/a.md', score: 40},
                        {path: 'ru/a.md', score: 50},
                    ],
                }),
            );

            const summary = readJudgeSummary(file);

            expect(summary?.judge).toEqual({
                model: 'judge-model',
                threshold: 70,
                scored: 10,
                averageScore: 88,
                low: 2,
                skippedPairs: 2,
            });
            expect(summary?.lowByPage.get('ru/a.md')).toBe(2);
        });

        it('should return null when the report is missing', () => {
            expect(readJudgeSummary('/nonexistent/report.json')).toBeNull();
        });
    });

    describe('main', () => {
        it('should run the full flow in real mode against a stub provider CLI', async () => {
            const root = mkdtempSync(join(tmpdir(), 'eval-cli-main-'));

            write(root, 'corpus/ru/a.md', '# Заметка\n\nЭто заметка.\n');
            write(root, 'corpus/en/a.md', '# Note\n\nThis is a note.\n');
            write(
                root,
                'corpus/glossary.yaml',
                'glossaryPairs:\n  - sourceText: заметка\n    translatedText: note\n',
            );

            // A stand-in for `yfm translate`: copies the reference pages
            // into the output, which is exactly what a perfect provider
            // would produce for this corpus.
            write(
                root,
                'fake-cli.js',
                [
                    "const {cpSync, mkdirSync} = require('node:fs');",
                    "const {join} = require('node:path');",
                    "const input = process.argv[process.argv.indexOf('-i') + 1];",
                    "const output = process.argv[process.argv.indexOf('-o') + 1];",
                    'mkdirSync(output, {recursive: true});',
                    "cpSync(join(input, 'en'), join(output, 'en'), {recursive: true});",
                ].join('\n'),
            );

            const workdir = join(root, 'work');
            mkdirSync(workdir, {recursive: true});

            const code = await main([
                '--real',
                '--no-judge',
                '--cli',
                join(root, 'fake-cli.js'),
                '--corpus',
                join(root, 'corpus'),
                '--workdir',
                workdir,
                '--model',
                'stub-model',
            ]);

            expect(code).toBe(0);

            const report = JSON.parse(readFileSync(join(workdir, 'eval-report.json'), 'utf8'));

            expect(report.passed).toBe(true);
            expect(report.mode).toBe('real');
            expect(report.model).toBe('stub-model');
            expect(report.pages).toEqual([expect.objectContaining({page: 'a.md', similarity: 1})]);
            expect(report.judge).toBeNull();
        });

        it('should fail fast when the CLI binary is missing', async () => {
            await expect(main(['--cli', '/nonexistent/cli.js'])).rejects.toThrow(
                /CLI binary not found/,
            );
        });
    });

    describe('evaluatePages', () => {
        it('should run all deterministic checks over the output', () => {
            const root = mkdtempSync(join(tmpdir(), 'eval-cli-spec-'));
            write(root, 'corpus/ru/a.md', '# Заметка\n\nЭто заметка про [ссылку](./b.md).\n');
            write(root, 'corpus/en/a.md', '# Note\n\nThis is a note about a [link](./b.md).\n');
            write(root, 'out/en/a.md', '# Note\n\nThis is a note about a [link](./c.md).\n');

            const results = evaluatePages({
                pages: ['a.md'],
                corpus: join(root, 'corpus'),
                output: join(root, 'out'),
                sourceLang: 'ru',
                targetLang: 'en',
                glossaryPairs: [
                    {sourceText: 'заметка', translatedText: 'note', sourceStem: 'заметк'},
                ],
                lowByPage: new Map([['ru/a.md', 1]]),
            });

            expect(results).toEqual([
                {
                    page: 'a.md',
                    markupViolations: [{type: 'links', detail: expect.stringContaining('./b.md')}],
                    glossaryViolations: [],
                    untranslated: [],
                    similarity: expect.closeTo(0.9, 1),
                    judgeLow: 1,
                },
            ]);
        });

        it('should report a missing output file', () => {
            const root = mkdtempSync(join(tmpdir(), 'eval-cli-spec-'));
            write(root, 'corpus/ru/a.md', 'Текст.');
            write(root, 'corpus/en/a.md', 'Text.');

            const results = evaluatePages({
                pages: ['a.md'],
                corpus: join(root, 'corpus'),
                output: join(root, 'out'),
                sourceLang: 'ru',
                targetLang: 'en',
                glossaryPairs: [],
            });

            expect(results[0].markupViolations).toEqual([
                {type: 'missing-output', detail: 'translated file was not produced'},
            ]);
            expect(results[0].similarity).toBe(0);
        });
    });
});
