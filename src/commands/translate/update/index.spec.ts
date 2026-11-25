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
