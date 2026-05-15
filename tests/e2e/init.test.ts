import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {TestAdapter, compareDirectories} from '../fixtures';

function run(args: string[]) {
    return TestAdapter.runner.runYfmDocs(['init', ...args]);
}

let tmpDir: string;

beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'yfm-init-'));
});

afterEach(async () => {
    await rm(tmpDir, {recursive: true, force: true});
});

describe('yfm init — single-lang', () => {
    it('creates project structure', async () => {
        const out = join(tmpDir, 'proj');
        const report = await run(['--output', out, '--name', 'My Docs', '--skip-interactive']);

        expect(report.code).toBe(0);
        await compareDirectories(out);
    });

    it('derives project name from output directory basename', async () => {
        const out = join(tmpDir, 'my-project');
        await run(['--output', out]);

        await compareDirectories(out);
    });

    it('--no-header removes navigation block', async () => {
        const out = join(tmpDir, 'proj');
        await run(['--output', out, '--name', 'My Docs', '--no-header', '--skip-interactive']);

        await compareDirectories(out);
    });
});

describe('yfm init — multi-lang', () => {
    it('creates project structure', async () => {
        const out = join(tmpDir, 'proj');
        const report = await run([
            '--output',
            out,
            '--langs',
            'ru,en',
            '--name',
            'My Docs',
            '--skip-interactive',
        ]);

        expect(report.code).toBe(0);
        await compareDirectories(out);
    });

    it('--default-lang sets lang field in .yfm', async () => {
        const out = join(tmpDir, 'proj');
        await run([
            '--output',
            out,
            '--langs',
            'ru,en',
            '--default-lang',
            'en',
            '--name',
            'My Docs',
            '--skip-interactive',
        ]);

        await compareDirectories(out);
    });

    it('--no-header removes navigation from all toc.yaml files', async () => {
        const out = join(tmpDir, 'proj');
        await run([
            '--output',
            out,
            '--langs',
            'ru,en',
            '--no-header',
            '--name',
            'My Docs',
            '--skip-interactive',
        ]);

        await compareDirectories(out);
    });
});

describe('yfm init — errors', () => {
    it('fails with non-zero exit code if output directory is not empty', async () => {
        const out = join(tmpDir, 'proj');
        await run(['--output', out]);

        const report = await run(['--output', out]);
        expect(report.code).toBeGreaterThan(0);
    });
});
