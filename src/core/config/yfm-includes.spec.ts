import {mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {resolveConfig} from '.';

describe('!include in a project config', () => {
    let root: string;
    let dir: string;
    let config: AbsolutePath;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'yfm-includes-'));
        dir = join(root, 'docs');
        mkdirSync(dir);
        config = join(dir, '.yfm') as AbsolutePath;
    });

    afterEach(() => rmSync(root, {recursive: true, force: true}));

    it('resolves values before applying the command scope and defaults', async () => {
        writeFileSync(config, 'build: !include build.yaml');
        writeFileSync(join(dir, 'build.yaml'), 'jobs: 2');
        const result = await resolveConfig(config, {
            yfm: true,
            filter: (data) => data.build,
            defaults: {jobs: 1, lang: 'en'},
        });
        expect({...result}).toEqual({jobs: 2, lang: 'en'});
    });

    it('accepts a mapping included at the document root', async () => {
        writeFileSync(config, '!include project.yaml');
        writeFileSync(join(dir, 'project.yaml'), 'langs: &langs [en, ru]\nother: *langs');
        expect({...(await resolveConfig(config, {yfm: true}))}).toEqual({
            langs: ['en', 'ru'],
            other: ['en', 'ru'],
        });
    });

    it('requires a mapping when replacing the entire project config', async () => {
        writeFileSync(config, '!include flag.yaml');
        writeFileSync(join(dir, 'flag.yaml'), 'false');
        await expect(resolveConfig(config, {yfm: true})).rejects.toThrow(/YAML mapping/);
    });

    it('reports a missing fragment even when the root config is optional', async () => {
        writeFileSync(config, 'search: !include missing.yaml');
        await expect(resolveConfig(config, {yfm: true, fallback: {}})).rejects.toThrow(
            /missing\.yaml/,
        );
    });

    it('reports the file chain for a cycle', async () => {
        writeFileSync(config, 'search: !include a.yaml');
        writeFileSync(join(dir, 'a.yaml'), '!include b.yaml');
        writeFileSync(join(dir, 'b.yaml'), '!include a.yaml');
        await expect(resolveConfig(config, {yfm: true})).rejects.toThrow(
            /Circular !include: .*\.yfm -> .*a\.yaml -> .*b\.yaml -> .*a\.yaml/,
        );
    });

    it('rejects files outside the config directory, including symlinks', async () => {
        const outsideDir = join(root, 'outside');
        mkdirSync(outsideDir);
        const outside = join(outsideDir, 'fragment.yaml');
        writeFileSync(outside, '[]');
        symlinkSync(outsideDir, join(dir, 'link'), 'junction');
        for (const path of ['link/fragment.yaml', '../outside/fragment.yaml', outside]) {
            writeFileSync(config, `projects: !include ${path}`);
            await expect(resolveConfig(config, {yfm: true})).rejects.toThrow(
                /outside the config directory|relative !include path/,
            );
        }
    });

    it('retains ordinary YAML parsing for other configuration files', async () => {
        const redirects = join(dir, 'redirects.yaml') as AbsolutePath;
        writeFileSync(redirects, 'redirects: !include rules.yaml');
        await expect(resolveConfig(redirects)).rejects.toThrow(/unknown tag/);
    });
});
