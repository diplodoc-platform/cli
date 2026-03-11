import {existsSync, readFileSync} from 'node:fs';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {Init} from './index';

function makeInit(overrides: Partial<ConstructorParameters<typeof Init>[0]> = {}) {
    return new Init({
        output: join(tmpdir(), 'unused'),
        langs: ['ru'],
        header: true,
        input: '/' as AbsolutePath,
        quiet: false,
        strict: false,
        config: '.yfm',
        ...overrides,
    } as ConstructorParameters<typeof Init>[0]);
}

let tmpDir: string;

beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'yfm-init-'));
});

afterEach(async () => {
    await rm(tmpDir, {recursive: true, force: true});
});

describe('Init.action() — single-lang', () => {
    it('creates .yfm, toc.yaml, index.md in non-existent output dir', async () => {
        const out = join(tmpDir, 'proj');
        const init = makeInit({output: out, langs: ['ru'], name: 'My Docs'});

        await init.action();

        expect(existsSync(join(out, '.yfm'))).toBe(true);
        expect(existsSync(join(out, 'toc.yaml'))).toBe(true);
        expect(existsSync(join(out, 'index.md'))).toBe(true);
    });

    it('does not create multilang structure', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, langs: ['ru']}).action();

        expect(existsSync(join(out, 'ru'))).toBe(false);
        expect(existsSync(join(out, 'presets.yaml'))).toBe(false);
    });

    it('.yfm contains lang and no langs block', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, langs: ['ru']}).action();

        const yfm = readFileSync(join(out, '.yfm'), 'utf8');
        expect(yfm).toContain('lang: ru');
        expect(yfm).not.toContain('langs:');
    });

    it('toc.yaml title comes from --name', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, name: 'Docs Title'}).action();

        expect(readFileSync(join(out, 'toc.yaml'), 'utf8')).toContain('title: Docs Title');
    });

    it('toc.yaml title falls back to output directory basename', async () => {
        const out = join(tmpDir, 'my-project');
        await makeInit({output: out}).action();

        expect(readFileSync(join(out, 'toc.yaml'), 'utf8')).toContain('title: my-project');
    });

    it('toc.yaml contains navigation when header is true', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, header: true}).action();

        expect(readFileSync(join(out, 'toc.yaml'), 'utf8')).toContain('navigation:');
    });

    it('toc.yaml has no navigation when header is false', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, header: false}).action();

        expect(readFileSync(join(out, 'toc.yaml'), 'utf8')).not.toContain('navigation:');
    });

    it('succeeds when output dir already exists and is empty', async () => {
        const out = tmpDir;
        await expect(makeInit({output: out}).action()).resolves.not.toThrow();
    });
});

describe('Init.action() — multi-lang', () => {
    it('creates per-language directories with toc.yaml and index.md', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, langs: ['ru', 'en'], name: 'My Docs'}).action();

        expect(existsSync(join(out, 'ru/toc.yaml'))).toBe(true);
        expect(existsSync(join(out, 'ru/index.md'))).toBe(true);
        expect(existsSync(join(out, 'en/toc.yaml'))).toBe(true);
        expect(existsSync(join(out, 'en/index.md'))).toBe(true);
    });

    it('creates presets.yaml', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, langs: ['ru', 'en']}).action();

        expect(existsSync(join(out, 'presets.yaml'))).toBe(true);
    });

    it('.yfm contains inline langs array', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, langs: ['ru', 'en']}).action();

        expect(readFileSync(join(out, '.yfm'), 'utf8')).toContain("langs: ['ru', 'en']");
    });

    it('--default-lang sets lang field in .yfm', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, langs: ['ru', 'en'], defaultLang: 'en'}).action();

        expect(readFileSync(join(out, '.yfm'), 'utf8')).toMatch(/^lang: en/m);
    });

    it('lang defaults to first in langs when defaultLang not set', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, langs: ['en', 'ru']}).action();

        expect(readFileSync(join(out, '.yfm'), 'utf8')).toMatch(/^lang: en/m);
    });
});

describe('Init.action() — errors', () => {
    it('throws when output directory is not empty', async () => {
        const out = tmpDir;
        await writeFile(join(out, 'existing.txt'), 'data');

        await expect(makeInit({output: out}).action()).rejects.toThrow('is not empty');
    });
});
