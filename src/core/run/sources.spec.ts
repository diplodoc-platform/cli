import type {Config} from '~/core/config';
import type {BaseConfig} from '~/core/program';
import type {VarsServiceConfig} from '~/core/vars/VarsService';

import {
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    realpath,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {tmpdir} from 'node:os';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {VarsService} from '~/core/vars';

import {InsecureAccessError} from './errors';

import {Run} from './index';

class SourceRun extends Run<VarsServiceConfig> {
    readonly input: AbsolutePath;

    constructor(original: AbsolutePath, stage: AbsolutePath, selective = true) {
        super({
            input: original,
            vars: {},
            varsPreset: 'public',
            ignore: [],
        } as unknown as Config<BaseConfig & VarsServiceConfig>);
        this.input = stage;
        this.scopes.set('<origin>', original);
        this.scopes.set('<input>', stage);
        if (selective) {
            this.sources.configure(original, stage, ['**/node_modules/**']);
        }
    }
}

describe('selective native source access', () => {
    let root: AbsolutePath;
    let original: AbsolutePath;
    let stage: AbsolutePath;
    let run: SourceRun;

    async function source(path: string, content: string) {
        const target = join(original, path);
        await mkdir(dirname(target), {recursive: true});
        await writeFile(target, content);
    }

    beforeEach(async () => {
        const temporary = await mkdtemp(join(tmpdir(), 'yfm-sources-'));
        root = (await realpath(temporary as AbsolutePath)) as AbsolutePath;
        original = join(root, 'original');
        stage = join(root, 'stage');
        await mkdir(original);
        await mkdir(stage);
        run = new SourceRun(original, stage);
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    it('reads selected original bytes without initially staging unrelated sources', async () => {
        await source('index.md', '# Original');
        await source('unrelated/unused.yaml', 'not selected');

        expect(await run.read(join(stage, 'index.md'))).toBe('# Original');
        expect(await readdir(stage)).toEqual([]);
        expect(run.sources.dependencies).toEqual([join(original, 'index.md')]);
        expect(run.statSync(join(stage, 'index.md')).size).toBe(10);
    });

    it('keeps the ordinary runtime inactive and does not read through missing workspace files', async () => {
        await source('index.md', '# Original');
        const ordinary = new SourceRun(original, stage, false);

        await expect(ordinary.read(join(stage, 'index.md'))).rejects.toMatchObject({
            code: 'ENOENT',
        });
        expect(ordinary.sources.dependencies).toEqual([]);
    });

    it('copies merge files without selecting unused originals and keeps repeated-copy snapshots', async () => {
        await source('package/page.md', '# Original');
        await source('package/unused.txt', 'unused');

        const pairs = await run.copy(join(stage, 'package'), join(stage, 'first'));
        expect(pairs).toContainEqual([
            join(stage, 'package/page.md'),
            join(stage, 'first/page.md'),
        ]);
        await run.copy(join(stage, 'first'), join(stage, 'second'));
        expect(run.sources.dependencies).toEqual([]);

        await run.write(join(stage, 'first/page.md'), '# Generated', true);
        expect(await run.read(join(stage, 'first/page.md'))).toBe('# Generated');
        expect(run.sources.dependencies).toEqual([]);
        expect(await run.read(join(stage, 'second/page.md'))).toBe('# Original');
        expect(run.sources.dependencies).toEqual([join(original, 'package/page.md')]);

        await run.copy(join(stage, 'first'), join(stage, 'third'));
        await run.write(join(stage, 'first/page.md'), '# Replaced', true);
        expect(await run.read(join(stage, 'third/page.md'))).toBe('# Generated');
        expect(run.sources.dependencies).toEqual([join(original, 'package/page.md')]);
    });

    it('retains an already selected original when generated content overwrites its stage path', async () => {
        await source('index.md', '# Original');
        await run.read(join(stage, 'index.md'));
        await run.write(join(stage, 'index.md'), '# Generated', true);

        expect(await run.read(join(stage, 'index.md'))).toBe('# Generated');
        expect(await readFile(join(original, 'index.md'), 'utf8')).toBe('# Original');
        expect(run.sources.dependencies).toEqual([join(original, 'index.md')]);
    });

    it('materializes only an explicitly requested source for a native adapter', async () => {
        await source('spec/data.yaml', 'type: string');
        await source('spec/unused.yaml', 'unused');

        const path = await run.materialize(join(stage, 'spec/data.yaml'));

        expect(await readFile(path, 'utf8')).toBe('type: string');
        expect(await readdir(join(stage, 'spec'))).toEqual(['data.yaml']);
        expect(await run.read(path)).toBe('type: string');
        expect(run.sources.dependencies).toEqual([join(original, 'spec/data.yaml')]);
    });

    it.each([false, true])(
        'keeps an explicitly removed file absent, materialized: %s',
        async (materialized) => {
            await source('page.md', '# Original');
            if (materialized) {
                await run.materialize(join(stage, 'page.md'));
            }

            await run.remove(join(stage, 'page.md'));

            expect(run.exists(join(stage, 'page.md'))).toBe(false);
            await expect(run.read(join(stage, 'page.md'))).rejects.toMatchObject({code: 'ENOENT'});
            expect(await run.glob('**/*.md', {cwd: stage})).toEqual([]);
            await run.write(join(stage, 'page.md'), '# Recreated');
            expect(await run.read(join(stage, 'page.md'))).toBe('# Recreated');
            expect(await readFile(join(original, 'page.md'), 'utf8')).toBe('# Original');
        },
    );

    it('keeps a removed directory absent while allowing generated and copied replacements', async () => {
        await source('section/page.md', '# Original');
        await source('section/unused.md', '# Unused');
        await source('replacement/page.md', '# Copied');
        await run.materialize(join(stage, 'section/page.md'));

        await run.remove(join(stage, 'section'));

        expect(run.exists(join(stage, 'section'))).toBe(false);
        expect(run.exists(join(stage, 'section/page.md'))).toBe(false);
        expect(await run.glob('**/*.md', {cwd: join(stage, 'section')})).toEqual([]);
        await run.write(join(stage, 'section/generated.md'), '# Generated');
        expect(await run.read(join(stage, 'section/generated.md'))).toBe('# Generated');
        expect(run.exists(join(stage, 'section/unused.md'))).toBe(false);

        await run.copy(join(stage, 'replacement'), join(stage, 'section'));
        expect(await run.read(join(stage, 'section/page.md'))).toBe('# Copied');
        expect(run.exists(join(stage, 'section/unused.md'))).toBe(false);
    });

    it('starts a fresh logical workspace after initial physical cleanup', async () => {
        await source('page.md', '# Original');
        await run.remove(stage);
        run.sources.resetWorkspace();
        await mkdir(stage);

        expect(await run.read(join(stage, 'page.md'))).toBe('# Original');
        expect(await readdir(stage)).toEqual([]);
    });

    it('reads an original relative symlink outside input identically before and after native copying', async () => {
        await writeFile(join(root, 'external.md'), '# External');
        await symlink('../external.md', join(original, 'alias.md'));

        expect(await run.read(join(stage, 'alias.md'))).toBe('# External');
        await run.copy(join(stage, 'alias.md'), join(stage, 'physical.md'));
        expect(await run.read(join(stage, 'physical.md'))).toBe('# External');
        await run.materialize(join(stage, 'alias.md'));
        expect(await run.read(join(stage, 'alias.md'))).toBe('# External');
        expect(run.sources.dependencies).toEqual([join(original, 'alias.md')]);
    });

    it('rejects arbitrary external reads and generated workspace symlinks escaping its scopes', async () => {
        const outside = join(root, 'stage-outside');
        await mkdir(outside);
        await writeFile(join(outside, 'page.md'), '# External');
        await source('linked/missing.md', '# Original fallback');
        await symlink('../stage-outside/page.md', join(stage, 'alias.md'));
        await symlink('../stage-outside', join(stage, 'linked'));

        await expect(run.read(join(outside, 'page.md'))).rejects.toBeInstanceOf(
            InsecureAccessError,
        );
        await expect(run.read(join(stage, 'alias.md'))).rejects.toBeInstanceOf(InsecureAccessError);
        await expect(run.read(join(stage, 'linked/page.md'))).rejects.toBeInstanceOf(
            InsecureAccessError,
        );
        await expect(run.materialize(join(stage, 'linked/page.md'))).rejects.toBeInstanceOf(
            InsecureAccessError,
        );
        await expect(run.read(join(stage, 'linked/missing.md'))).rejects.toMatchObject({
            code: 'ENOENT',
        });
        expect(await run.glob('**/*.md', {cwd: join(stage, 'linked')})).not.toContain('missing.md');
    });

    it('selects explicit directory contents and native glob matches, excluding ignored input files', async () => {
        await source('section/page.md', '# Page');
        await source('section/data.yaml', 'declared');
        await source('section/node_modules/ignored.md', '# Ignored');
        await source('outside/unused.md', '# Unused');

        expect(run.exists(join(stage, 'section'))).toBe(true);
        expect(run.sources.dependencies).toEqual([]);
        expect(await run.glob('**/*.md', {cwd: join(stage, 'section')})).toEqual(['page.md']);
        expect(run.sources.dependencies).toEqual([join(original, 'section/page.md')]);
        await run.depend(join(stage, 'section'));

        expect(new Set(run.sources.dependencies)).toEqual(
            new Set([
                join(original, 'section'),
                join(original, 'section/page.md'),
                join(original, 'section/data.yaml'),
            ]),
        );
    });

    it('declares original files even when generated siblings already created their workspace directory', async () => {
        await source('section/data.yaml', 'declared');
        await run.write(join(stage, 'section/generated.md'), '# Generated', true);

        await run.depend(join(stage, 'section'));

        expect(run.sources.dependencies).toEqual([join(original, 'section/data.yaml')]);
        expect(await run.read(join(stage, 'section/generated.md'))).toBe('# Generated');
    });

    it('loads ancestor presets from their original pre-merge paths before taking variable snapshots', async () => {
        await source('presets.yaml', 'default:\n  root: root\npublic:\n  label: public');
        await source('section/presets.yaml', 'default:\n  label: section\n  local: local');
        await source('unrelated/presets.yaml', 'invalid: [');
        const vars = new VarsService(run);

        await vars.init();
        expect(run.sources.dependencies).toEqual([]);
        await run.write(join(stage, 'section/presets.yaml'), 'default:\n  label: generated', true);
        await Promise.all([
            vars.ensure('section/page.md' as RelativePath),
            vars.ensure('section/other.md' as RelativePath),
        ]);
        const values = vars.for('section/page.md' as RelativePath);

        expect(values.root).toBe('root');
        expect(values.label).toBe('section');
        expect(values.local).toBe('local');
        expect(new Set(run.sources.dependencies)).toEqual(
            new Set([join(original, 'presets.yaml'), join(original, 'section/presets.yaml')]),
        );
    });
});
