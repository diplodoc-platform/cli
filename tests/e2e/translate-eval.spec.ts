import {execa} from 'execa';
import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

const root = resolve(__dirname, '../..');

describe('translate eval harness', () => {
    it(
        'should pass end-to-end on the reference corpus with the mock provider',
        {timeout: 300_000},
        async () => {
            const workdir = mkdtempSync(join(tmpdir(), 'translate-eval-e2e-'));
            const reportFile = join(workdir, 'report.json');

            const result = await execa(
                process.execPath,
                [
                    join(root, 'scripts/translate-eval.mjs'),
                    '--workdir',
                    workdir,
                    '--report',
                    reportFile,
                ],
                {cwd: root, reject: false},
            );

            expect(result.stdout).toContain('Verdict: PASS');
            expect(result.exitCode).toBe(0);

            const report = JSON.parse(readFileSync(reportFile, 'utf8'));

            expect(report.passed).toBe(true);
            expect(report.mode).toBe('mock');
            expect(report.pages.length).toBeGreaterThanOrEqual(12);
            expect(report.judge.scored).toBeGreaterThan(0);
            expect(report.failures).toEqual([]);
        },
    );
});
