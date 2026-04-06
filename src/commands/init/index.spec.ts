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
        template: 'minimal',
        force: false,
        dryRun: false,
        skipInteractive: true,
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
        await makeInit({output: out, langs: ['ru'], name: 'My Docs'}).action();

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
        await expect(makeInit({output: tmpDir}).action()).resolves.not.toThrow();
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

    it('ignores defaultLang if it is not in langs', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, langs: ['ru', 'en'], defaultLang: 'fr'}).action();

        expect(readFileSync(join(out, '.yfm'), 'utf8')).toMatch(/^lang: ru/m);
    });
});

describe('Init.action() — template: full', () => {
    it('single-lang: creates pc.yaml', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, langs: ['ru'], template: 'full'}).action();

        expect(existsSync(join(out, 'pc.yaml'))).toBe(true);
    });

    it('single-lang: creates presets.yaml', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, langs: ['ru'], template: 'full', name: 'Test'}).action();

        expect(existsSync(join(out, 'presets.yaml'))).toBe(true);
    });

    it('single-lang: .yfm contains extended config', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, langs: ['ru'], template: 'full'}).action();

        const yfm = readFileSync(join(out, '.yfm'), 'utf8');
        expect(yfm).toContain('pdf:');
        expect(yfm).toContain('search:');
        expect(yfm).toContain('vcs: true');
    });

    it('multi-lang: creates pc.yaml per language', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, langs: ['ru', 'en'], template: 'full'}).action();

        expect(existsSync(join(out, 'ru/pc.yaml'))).toBe(true);
        expect(existsSync(join(out, 'en/pc.yaml'))).toBe(true);
    });
});

describe('Init.action() — --force', () => {
    it('overwrites existing files', async () => {
        const out = join(tmpDir, 'proj');

        await makeInit({output: out, langs: ['ru'], name: 'First'}).action();
        await makeInit({output: out, langs: ['ru'], name: 'Second', force: true}).action();

        expect(readFileSync(join(out, 'toc.yaml'), 'utf8')).toContain('title: Second');
    });

    it('removes files from previous run that are not in new output', async () => {
        const out = join(tmpDir, 'proj');

        // Первый раз — multilang, создаёт ru/ и en/
        await makeInit({output: out, langs: ['ru', 'en'], name: 'First'}).action();
        expect(existsSync(join(out, 'ru/toc.yaml'))).toBe(true);

        // Второй раз — single-lang с --force, ru/ должна исчезнуть
        await makeInit({output: out, langs: ['ru'], name: 'Second', force: true}).action();
        expect(existsSync(join(out, 'ru/toc.yaml'))).toBe(false);
    });

    it('succeeds on non-empty directory without --force would throw', async () => {
        const out = tmpDir;
        await writeFile(join(out, 'existing.txt'), 'data');

        await expect(makeInit({output: out, force: true}).action()).resolves.not.toThrow();
    });
});

describe('Init.action() — --dry-run', () => {
    it('does not create any files', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, dryRun: true}).action();

        expect(existsSync(out)).toBe(false);
    });

    it('does not throw on non-empty directory', async () => {
        const out = tmpDir;
        await writeFile(join(out, 'existing.txt'), 'data');

        await expect(makeInit({output: out, dryRun: true}).action()).resolves.not.toThrow();
    });

    it('can be combined with --force without writing files', async () => {
        const out = join(tmpDir, 'proj');
        await makeInit({output: out, dryRun: true, force: true}).action();

        expect(existsSync(out)).toBe(false);
    });
});

describe('Init.action() — errors', () => {
    it('throws when output directory is not empty', async () => {
        const out = tmpDir;
        await writeFile(join(out, 'existing.txt'), 'data');

        await expect(makeInit({output: out}).action()).rejects.toThrow('is not empty');
    });

    it('error message suggests --force', async () => {
        const out = tmpDir;
        await writeFile(join(out, 'existing.txt'), 'data');

        await expect(makeInit({output: out}).action()).rejects.toThrow('--force');
    });
});
