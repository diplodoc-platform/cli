import type {IProvider, TranslateConfig} from '../index';
import type {TranslateRunReport} from '../report';

import {ok} from 'node:assert';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, posix} from 'node:path';

import {untranslatedMarker} from '../providers/ai/utils/script';
import {RunReport, createTargetStat, reportError} from '../report';

import {readUpdate} from './manifest';
import {canonicalPath, writeAtomic, writeTranslation} from './output';
import {yfmProse} from './text/yfm-units';

async function writeReport(config: TranslateConfig, data: TranslateRunReport) {
    if (config.report) {
        await writeAtomic(config.report, JSON.stringify(data, null, 2) + '\n');
    }
}

function checkOpenapiText(input: string, output: string, source: string, target: string) {
    const prose = yfmProse(output);
    ok(prose.trim() && prose !== yfmProse(input), 'OpenAPI translation repeated the source prose');
    const marker = untranslatedMarker(source, target);
    ok(!marker?.test(prose), 'OpenAPI translation contains source-language prose');
}

async function translatePayload(
    provider: IProvider,
    config: TranslateConfig,
    update: Awaited<ReturnType<typeof readUpdate>>,
    target: string,
    recordReport: (data: TranslateRunReport) => void,
) {
    const dir = await mkdtemp(join(tmpdir(), 'yfm-translate-'));
    try {
        const source = config.source.language;
        const logical = posix.join(source, update.file);
        const file = posix.join(source, update.payloadFile);
        const input = join(dir, 'in') as AbsolutePath;
        const output = join(dir, 'out') as AbsolutePath;
        const report = join(dir, 'report.json') as AbsolutePath;
        await mkdir(dirname(join(input, file)), {recursive: true});
        await writeFile(join(input, file), update.plan.input);
        const payloadConfig = {
            ...config,
            input,
            output,
            report,
            code: update.kind === 'markdown' ? config.code : ('no' as const),
            varsFor: () => config.varsFor?.(logical) ?? config.vars,
        };
        await provider.skip([], payloadConfig);
        try {
            await provider.translate([file], payloadConfig);
        } catch (error) {
            const failed = await readFile(report, 'utf8').catch(() => '');
            if (failed) {
                recordReport(JSON.parse(failed));
            }
            throw error;
        }
        const data: TranslateRunReport = JSON.parse(await readFile(report, 'utf8'));
        recordReport(data);
        ok(
            data.schemaVersion === 1 &&
                data.status === 'success' &&
                data.files.selected === 1 &&
                data.totals.files.translated === 1 &&
                !data.totals.files.failed &&
                !data.totals.files.partial &&
                !data.totals.units.untranslated &&
                !data.totals.units.oversized &&
                !data.totals.fixes.markupDamaged,
            'Translation provider returned an incomplete source update',
        );
        const text = config.dryRun
            ? ''
            : await readFile(join(output, target, update.payloadFile), 'utf8');
        if (!config.dryRun && update.kind === 'openapi') {
            checkOpenapiText(update.plan.input, text, source, target);
        }
        const quality = data.targets.some((entry) => entry.judge)
            ? await readFile(join(output, `translate-quality.${target}.json`), 'utf8')
            : undefined;
        return {data, text, quality};
    } finally {
        await rm(dir, {recursive: true, force: true});
    }
}

export async function translateUpdate(
    provider: IProvider,
    config: TranslateConfig,
    manifest: AbsolutePath,
) {
    const report = RunReport.start(config, 1, 0);
    let reportSafe = false;
    let providerReport: TranslateRunReport | undefined;
    try {
        const source = config.source.language;
        const target = config.target[0]?.language;
        ok(
            config.target.length === 1 &&
                /^[a-z][a-z0-9_-]*$/i.test(source) &&
                typeof target === 'string' &&
                /^[a-z][a-z0-9_-]*$/i.test(target) &&
                source !== target,
            'Source updates require distinct source and target languages',
        );
        ok(
            !config.copyAssets &&
                !config.includeVcsDiff &&
                !config.files?.length &&
                !config.exclude.length,
            'Source updates use the file selected in the manifest',
        );
        const qualityPath = join(config.output, `translate-quality.${target}.json`);
        const update = await readUpdate(manifest, source, target, async (file) => {
            if (config.report) {
                const destination = await canonicalPath(config.report);
                ok(
                    destination !== (await canonicalPath(manifest)) &&
                        destination !== (await canonicalPath(qualityPath)) &&
                        destination !== (await canonicalPath(join(config.output, target, file))),
                    'The report must use a separate path from the manifest and the translation',
                );
            }
            reportSafe = true;
        });
        ok(
            config.include.every(
                (file) => file.replace(/\\(.)/g, '$1') === posix.join(source, update.file),
            ),
            'Include must select the source update file',
        );
        let data: TranslateRunReport;
        let text = '';
        let quality: string | undefined;
        if (update.plan.input) {
            ({data, text, quality} = await translatePayload(
                provider,
                config,
                update,
                target,
                (data) => {
                    providerReport = data;
                },
            ));
        } else {
            const stat = createTargetStat();
            stat.filesTranslated = 1;
            report.addTarget(target, stat);
            data = report.finalize();
        }
        if (!config.dryRun) {
            await writeTranslation(
                config.output,
                posix.join(target, update.file),
                update.target,
                update.plan.apply(text),
            );
        }
        if (quality) {
            await writeAtomic(qualityPath, quality);
        }
        await writeReport(config, {...data, update: {version: 1, file: update.file}});
    } catch (error) {
        const failure = RunReport.start(config, 1, 0);
        failure.addError(reportError(error));
        if (reportSafe) {
            await writeReport(
                config,
                providerReport
                    ? {
                          ...providerReport,
                          status: 'failed',
                          errors: [...providerReport.errors, reportError(error)],
                      }
                    : failure.finalize('failed'),
            );
        }
        throw error;
    }
}
