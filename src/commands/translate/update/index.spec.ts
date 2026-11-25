import type {IProvider, TranslateConfig} from '../index';

import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {RunReport, createTargetStat} from '../report';

import {writeTranslation} from './output';

import {translateUpdate} from './index';

describe('translate with a source update manifest', () => {
    let dir: AbsolutePath;
    let config: TranslateConfig;
    let manifest: AbsolutePath;
    let output: AbsolutePath;
    const file = 'pages/start.md';
    const data = {
        version: 1,
        kind: 'markdown',
        file,
        before: '# Start {#start}\n',
        after: '# Start {#start}\n\nRead the guide.\n',
        target: '# Début {#start}\n',
    };
    let provider: IProvider;

    beforeEach(async () => {
        dir = (await mkdtemp(join(tmpdir(), 'translate-update-test-'))) as AbsolutePath;
        manifest = join(dir, 'update.json');
        config = {
            output: join(dir, 'out'),
            source: {language: 'en', locale: ''},
            target: [{language: 'fr', locale: ''}],
            provider: 'example',
            include: [],
            exclude: [],
            dryRun: false,
            report: join(dir, 'report.json'),
        } as Partial<TranslateConfig> as TranslateConfig;
        output = join(config.output, 'fr', file);
        await writeFile(manifest, JSON.stringify(data));
        provider = {skip: vi.fn(), translate: vi.fn()};
    });

    afterEach(async () => rm(dir, {recursive: true, force: true}));

    it('sends only the inserted paragraph and writes the edited translation', async () => {
        provider.translate = async ([path], cfg) => {
            expect(await readFile(join(cfg.input, path), 'utf8')).toMatch(
                /^\s*Read the guide\.\s*$/,
            );
            const file = join(cfg.output, 'fr/pages/start.md');
            await mkdir(dirname(file), {recursive: true});
            await writeFile(file, 'Lisez le guide.\n');
            const report = RunReport.start(cfg, 1, 0);
            const stat = createTargetStat();
            stat.filesTranslated = 1;
            stat.unitsTotal = 1;
            stat.translatedUnits = 1;
            report.addTarget('fr', stat);
            report.finalize();
            report.write();
        };
        await translateUpdate(provider, config, manifest);
        expect(await readFile(output, 'utf8')).toBe('# Début {#start}\n\nLisez le guide.\n');
        expect(JSON.parse(await readFile(config.report!, 'utf8'))).toMatchObject({
            status: 'success',
            update: {version: 1, file},
        });
    });

    it.each([
        [null, 'manifest version'],
        [{...data, version: 8}, 'manifest version'],
        [{...data, file: 'a//b.md'}, 'relative file'],
        [{...data, kind: 'toc'}, 'kind does not match'],
        [{...data, kind: 'yaml'}, 'Unknown source update'],
        [{...data, before: 0}, 'contents'],
        [{...data, target: []}, 'contents'],
        [{...data, kind: 'openapi'}, 'localized YAML'],
        [{...data, kind: 'openapi', file: 'spec.yaml', before: []}, 'snapshot keyed'],
        [{...data, kind: 'openapi', file: 'spec.yaml', before: {'../dep': 'bad'}}, 'relative file'],
        [{...data, kind: 'openapi', file: 'spec.yaml', before: {'dep.yaml': 3}}, 'file contents'],
    ])(
        'rejects an invalid manifest before invoking the provider (%#)',
        async (manifestValue, reason) => {
            await writeFile(manifest, JSON.stringify(manifestValue));
            await expect(translateUpdate(provider, config, manifest)).rejects.toThrow(
                String(reason),
            );
            expect(provider.translate).not.toHaveBeenCalled();
        },
    );

    it('updates a structural OpenAPI manifest and applies the selected source file filter', async () => {
        const file = 'api/spec.yaml';
        const spec = 'openapi: 3.0.3\npaths: {}\n';
        const graph = {[file]: spec};
        await writeFile(
            manifest,
            JSON.stringify({
                version: 1,
                kind: 'openapi',
                file,
                before: graph,
                after: graph,
                current: graph,
                target: spec,
            }),
        );
        await expect(
            translateUpdate(provider, {...config, include: ['en/other.md']}, manifest),
        ).rejects.toThrow('Include');
        await translateUpdate(provider, {...config, include: ['en/' + file]}, manifest);
        expect(await readFile(join(config.output, 'fr', file), 'utf8')).toBe(spec);
        expect(provider.translate).not.toHaveBeenCalled();
    });

    it('retains provider usage and cleans up the temporary payload on fatal errors', async () => {
        let temporaryInput = dir;
        provider.translate = async (_, cfg) => {
            temporaryInput = cfg.input;
            const report = RunReport.start(cfg, 1, 0);
            const stat = createTargetStat();
            stat.requests = 2;
            stat.filesFailed = 1;
            report.addTarget('fr', stat);
            report.finalize('failed');
            report.write();
            throw new Error('Provider unavailable');
        };
        await expect(translateUpdate(provider, config, manifest)).rejects.toThrow(
            'Provider unavailable',
        );
        expect(JSON.parse(await readFile(config.report!, 'utf8'))).toMatchObject({
            status: 'failed',
            totals: {requests: {total: 2}},
        });
        await expect(readFile(temporaryInput, 'utf8')).rejects.toMatchObject({code: 'ENOENT'});
    });

    it('estimates a changed page without requiring provider output or modifying the target', async () => {
        await mkdir(dirname(output), {recursive: true});
        await writeFile(output, data.target);
        provider.translate = async (_, cfg) => {
            expect(cfg.dryRun).toBe(true);
            const report = RunReport.start(cfg, 1, 0);
            const stat = createTargetStat();
            stat.filesTranslated = 1;
            report.addTarget('fr', stat);
            report.finalize();
            report.write();
        };
        await translateUpdate(provider, {...config, dryRun: true}, manifest);
        expect(await readFile(output, 'utf8')).toBe(data.target);
        expect(JSON.parse(await readFile(config.report!, 'utf8'))).toMatchObject({
            dryRun: true,
            update: {file},
        });
    });

    it('does not call the provider for an unchanged page', async () => {
        await writeFile(manifest, JSON.stringify({...data, after: data.before}));
        await translateUpdate(provider, config, manifest);
        expect(provider.translate).not.toHaveBeenCalled();
        expect(await readFile(output, 'utf8')).toBe(data.target);
    });

    it('preserves an existing target when the provider returns a partial report', async () => {
        await mkdir(dirname(output), {recursive: true});
        await writeFile(output, data.target);
        provider.translate = async (_, cfg) => {
            const report = RunReport.start(cfg, 1, 0);
            report.addError({code: 'PARTIAL', message: 'missing fragment'});
            report.finalize();
            report.write();
        };
        await expect(translateUpdate(provider, config, manifest)).rejects.toThrow('incomplete');
        expect(await readFile(output, 'utf8')).toBe(data.target);
        expect(JSON.parse(await readFile(config.report!, 'utf8')).status).toBe('failed');
    });

    it('rejects competing writes built from the same target snapshot', async () => {
        await mkdir(dirname(output), {recursive: true});
        await writeFile(output, data.target);
        const results = await Promise.allSettled(
            ['Translation A', 'Translation B'].map((text) =>
                writeTranslation(config.output, 'fr/' + file, data.target, text),
            ),
        );
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(['Translation A', 'Translation B']).toContain(await readFile(output, 'utf8'));
    });

    it('preserves the input and output when the report path collides', async () => {
        await mkdir(dirname(output), {recursive: true});
        await writeFile(output, data.target);
        for (const path of [manifest, output]) {
            await expect(
                translateUpdate(provider, {...config, report: path}, manifest),
            ).rejects.toThrow('separate path');
        }
        expect(await readFile(output, 'utf8')).toBe(data.target);
        expect(JSON.parse(await readFile(manifest, 'utf8'))).toEqual(data);
        expect(provider.translate).not.toHaveBeenCalled();
    });

    it('rejects paths outside the output and preserves later target edits', async () => {
        await writeFile(manifest, JSON.stringify({...data, file: '../escape.md'}));
        await expect(translateUpdate(provider, config, manifest)).rejects.toThrow('relative file');
        await writeFile(manifest, JSON.stringify({...data, after: data.before}));
        await mkdir(dirname(output), {recursive: true});
        await writeFile(output, '# Later\n');
        await expect(translateUpdate(provider, config, manifest)).rejects.toThrow('changed since');
        await rm(dirname(output), {recursive: true});
        await symlink(dir, dirname(output), 'junction');
        await expect(translateUpdate(provider, config, manifest)).rejects.toThrow('symbolic link');
        expect(provider.translate).not.toHaveBeenCalled();
    });
});
