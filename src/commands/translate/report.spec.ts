import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {
    RunReport,
    TRANSLATE_REPORT_SCHEMA_VERSION,
    createTargetStat,
    scoreDistribution,
} from './report';

function makeReport(path?: AbsolutePath) {
    return new RunReport({
        provider: 'openai',
        model: 'gpt-4o-mini',
        fallbackModel: 'gpt-4o',
        dryRun: false,
        sourceLanguage: 'ru',
        targetLanguages: ['en'],
        path,
    });
}

describe('translate run report', () => {
    describe('scoreDistribution', () => {
        it('should build the full histogram with stable keys', () => {
            const distribution = scoreDistribution([5, 15, 15, 95, 100, 100]);

            expect(Object.keys(distribution)).toHaveLength(11);
            expect(distribution['0-9']).toBe(1);
            expect(distribution['10-19']).toBe(2);
            expect(distribution['90-99']).toBe(1);
            expect(distribution['100']).toBe(2);
            expect(distribution['50-59']).toBe(0);
        });
    });

    describe('RunReport', () => {
        it('should map target stat into schema counters', () => {
            const report = makeReport();
            const stat = createTargetStat();

            stat.unitsTotal = 10;
            stat.translatedUnits = 6;
            stat.cached = 3;
            stat.cacheMisses = 7;
            stat.cacheEnabled = true;
            stat.untranslated = 1;
            stat.oversized = 0;
            stat.sourceChars = 1000;
            stat.translatedChars = 1100;
            stat.bytes = 700;
            stat.requests = 4;
            stat.fallbackRequests = 1;
            stat.retries = 2;
            stat.inputTokens = 500;
            stat.outputTokens = 550;
            stat.usageSeen = true;
            stat.filesTranslated = 2;
            stat.filesFailed = 1;
            stat.filesRetried = 1;

            report.setFiles(3, 1);
            report.addTarget('en', stat);
            const data = report.finalize();

            expect(data.schemaVersion).toBe(TRANSLATE_REPORT_SCHEMA_VERSION);
            expect(data.status).toBe('success');
            expect(data.provider).toBe('openai');
            expect(data.model).toBe('gpt-4o-mini');
            expect(data.fallbackModel).toBe('gpt-4o');
            expect(data.fallbackUsed).toBe(true);
            expect(data.sourceLanguage).toBe('ru');
            expect(data.targetLanguages).toEqual(['en']);
            expect(data.files).toEqual({selected: 3, skipped: 1});
            expect(data.durationMs).toBeGreaterThanOrEqual(0);
            expect(Date.parse(data.startedAt)).toBeLessThanOrEqual(Date.parse(data.finishedAt));

            const target = data.targets[0];
            expect(target.language).toBe('en');
            expect(target.files).toEqual({translated: 2, failed: 1, retried: 1});
            expect(target.units).toEqual({
                total: 10,
                translated: 6,
                fromCache: 3,
                untranslated: 1,
                oversized: 0,
            });
            expect(target.chars).toEqual({source: 1000, translated: 1100, request: 700});
            expect(target.tokens).toEqual({input: 500, output: 550});
            expect(target.requests).toEqual({total: 4, fallback: 1, retries: 2});
            expect(target.cache).toEqual({enabled: true, hits: 3, misses: 7, hitRate: 0.3});

            expect(data.totals.units.total).toBe(10);
            expect(data.totals.cache.hitRate).toBe(0.3);
        });

        it('should sum totals across targets and keep tokens null when never reported', () => {
            const report = makeReport();

            const en = createTargetStat();
            en.unitsTotal = 4;
            en.translatedUnits = 4;
            en.sourceChars = 100;

            const de = createTargetStat();
            de.unitsTotal = 6;
            de.translatedUnits = 6;
            de.sourceChars = 200;

            report.addTarget('en', en);
            report.addTarget('de', de);
            const data = report.finalize();

            expect(data.totals.units.total).toBe(10);
            expect(data.totals.chars.source).toBe(300);
            expect(data.totals.tokens).toBeNull();
            expect(data.totals.cache).toEqual({
                enabled: false,
                hits: 0,
                misses: 0,
                hitRate: null,
            });
            expect(data.fallbackUsed).toBe(false);
        });

        it('should report partial status when errors were recorded', () => {
            const report = makeReport();

            report.addTarget('en', createTargetStat());
            report.addError({
                target: 'en',
                path: 'ru/broken.md',
                code: 'LLM_REQUEST_ERROR',
                message: 'boom',
            });

            const data = report.finalize();

            expect(data.status).toBe('partial');
            expect(data.errors).toEqual([
                {target: 'en', path: 'ru/broken.md', code: 'LLM_REQUEST_ERROR', message: 'boom'},
            ]);
        });

        it('should report failed status when finalized as failed and stay idempotent', () => {
            const report = makeReport();

            const failed = report.finalize('failed');
            expect(failed.status).toBe('failed');

            // Later calls must not overwrite the fixed result.
            expect(report.finalize().status).toBe('failed');
        });

        it('should attach judge stats to the target', () => {
            const report = makeReport();
            const judge = {
                model: 'gpt-4o',
                threshold: 70,
                scored: 5,
                averageScore: 88.5,
                belowThreshold: 1,
                unscored: 0,
                distribution: scoreDistribution([60, 85, 90, 95, 100]),
            };

            report.addTarget('en', createTargetStat(), judge);

            expect(report.finalize().targets[0].judge).toEqual(judge);
        });

        it('should write the report to the configured path', () => {
            const root = mkdtempSync(join(tmpdir(), 'yfm-report-'));
            const path = join(root, 'nested', 'report.json') as AbsolutePath;
            const report = makeReport(path);

            report.addTarget('en', createTargetStat());
            report.finalize();
            report.write();

            const written = JSON.parse(readFileSync(path, 'utf8'));
            expect(written.schemaVersion).toBe(TRANSLATE_REPORT_SCHEMA_VERSION);
            expect(written.targets).toHaveLength(1);
        });

        it('should render a one-line summary', () => {
            const report = makeReport();
            const stat = createTargetStat();

            stat.unitsTotal = 10;
            stat.cached = 5;
            stat.cacheMisses = 5;
            stat.cacheEnabled = true;
            stat.requests = 3;

            report.addTarget('en', stat);
            const summary = report.summary();

            expect(summary).not.toContain('\n');
            expect(summary).toContain('run success');
            expect(summary).toContain('units: 10 (5 cached, 50% hit rate)');
            expect(summary).toContain('requests: 3');
            expect(summary).toContain('errors: 0');
        });
    });
});
