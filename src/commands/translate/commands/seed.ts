import type {BaseArgs} from '~/core/program';
import type {Locale} from '../utils';
import type {ConfigDefaults} from '../utils/config';

import {existsSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';
import {pick} from 'lodash';
import {asyncify, eachLimit} from 'async';

import {YFM_CONFIG_FILENAME} from '~/constants';
import {Command, defined} from '~/core/config';
import {
    BaseProgram,
    getHooks as getBaseHooks,
    withConfigDefaults,
    withConfigScope,
} from '~/core/program';

import {options} from '../config';
import {TranslateLogger} from '../logger';
import {TranslateError, languageRepath, loadTranslationUnits} from '../utils';
import {SeedStore, collectSeedPairs, seedFilePath} from '../providers/ai/utils';
import {options as aiOptions} from '../providers/ai/config';
import {untranslatedMarker} from '../providers/ai/provider';
import {Run} from '../run';
import {configDefaults, resolveSource, resolveTargets, resolveVars} from '../utils/config';

import {getHooks, withHooks} from './hooks';

const MAX_CONCURRENCY = 50;

export type SeedParams = {
    input: AbsolutePath;
    /** Input-relative paths of source language files. */
    files: string[];
    sourceLanguage: string;
    targetLanguage: string;
    vars: Hash;
    cacheDir: AbsolutePath;
};

export type SeedStats = {
    seededFiles: number;
    seededUnits: number;
    skippedUnits: number;
    missingTargets: string[];
    mismatched: string[];
    /** Files whose source or target failed to load or extract. */
    failed: [string, string][];
};

/**
 * Derives translation cache seeds from existing target files.
 *
 * For every source file whose translation exists, both sides are split
 * into units the same way the translate run does; positionally aligned
 * pairs become cache entries, so a following translate run reuses the
 * existing translations and only sends changed units to the LLM.
 */
export async function seedTranslations(params: SeedParams): Promise<SeedStats> {
    const {input, files, sourceLanguage, targetLanguage, vars, cacheDir} = params;

    const inputRoot = resolve(input);
    const repath = languageRepath({
        inputRoot,
        outputRoot: inputRoot,
        sourceLanguage,
        targetLanguage,
    });
    const marker = untranslatedMarker(sourceLanguage, targetLanguage);
    const seeds = new SeedStore(seedFilePath(cacheDir, sourceLanguage, targetLanguage));

    const stats: SeedStats = {
        seededFiles: 0,
        seededUnits: 0,
        skippedUnits: 0,
        missingTargets: [],
        mismatched: [],
        failed: [],
    };

    await eachLimit(
        files,
        MAX_CONCURRENCY,
        asyncify(async (file: string) => {
            const inputPath = join(inputRoot, file) as AbsolutePath;
            const targetPath = repath(inputPath) as AbsolutePath;

            if (!existsSync(targetPath)) {
                stats.missingTargets.push(file);
                return;
            }

            try {
                await seedFile(file, inputPath, targetPath);
            } catch (error) {
                // One broken file (unparseable target markup, bad
                // frontmatter, ...) must not kill the whole seeding run:
                // the file is reported and falls back to a full
                // retranslation, exactly like a unit-count mismatch.
                stats.failed.push([file, String(error)]);
            }
        }),
    );

    seeds.flush();

    return stats;

    async function seedFile(file: string, inputPath: AbsolutePath, targetPath: AbsolutePath) {
        const source = await loadTranslationUnits({
            inputPath,
            path: file,
            sourceLanguage,
            targetLanguage,
            vars,
        });

        if (!source.units.length) {
            return;
        }

        const target = await loadTranslationUnits({
            inputPath: targetPath,
            path: relative(inputRoot, targetPath),
            sourceLanguage: targetLanguage,
            targetLanguage: sourceLanguage,
            vars,
        });

        const result = collectSeedPairs(source.units, target.units, marker);

        if (result.status === 'mismatch') {
            stats.mismatched.push(file);
            return;
        }

        for (const [sourceUnit, targetUnit] of result.pairs) {
            seeds.set(sourceUnit, targetUnit);
        }

        stats.seededFiles++;
        stats.seededUnits += result.pairs.length;
        stats.skippedUnits += result.skipped;
    }
}

export type SeedArgs = BaseArgs & {
    source?: string;
    target?: string | string[];
    include?: string[];
    exclude?: string[];
    vars?: Hash;
    cacheDir: string;
};

export type SeedConfig = Pick<BaseArgs, 'input' | 'strict' | 'quiet'> & {
    /** Not configurable: Run requires it, seeding never writes there. */
    output: AbsolutePath;
    source: Locale;
    target: Locale[];
    include: string[];
    exclude: string[];
    files: string[];
    skipped: [string, string][];
    vars: Hash;
    cacheDir: AbsolutePath;
} & ConfigDefaults;

@withHooks
@withConfigScope('translate.seed', {strict: true})
@withConfigDefaults(() => configDefaults())
export class Seed extends BaseProgram<SeedConfig, SeedArgs> {
    readonly name = 'Translate.Seed';

    readonly command = new Command('seed').description(
        'Populate the translation cache from existing target files.',
    );

    readonly options = [
        options.input('./'),
        options.source,
        options.target,
        options.files,
        options.include,
        options.exclude,
        options.vars,
        options.config(YFM_CONFIG_FILENAME),
        aiOptions.cacheDir,
    ];

    readonly logger = new TranslateLogger();

    private run!: Run;

    apply(program?: BaseProgram) {
        super.apply(program);

        getBaseHooks(this).Config.tap('Translate.Seed', (config, args) => {
            const {input, quiet, strict} = pick(args, ['input', 'quiet', 'strict']) as SeedArgs;
            const source = resolveSource(config, args);
            const target = resolveTargets(config, args);
            const include = defined('include', args, config) || [];
            const exclude = defined('exclude', args, config) || [];
            const files = defined('files', args, config) || [];
            const vars = resolveVars(config, args);
            const cacheDir = defined('cacheDir', args, config);

            if (!cacheDir) {
                throw new TranslateError('Required option --cache-dir is not defined', 'CONFIG');
            }

            return Object.assign(config, {
                input,
                output: input,
                quiet,
                strict,
                source,
                target,
                files,
                include,
                exclude,
                vars,
                cacheDir: resolve(cacheDir),
            });
        });
    }

    async action() {
        const {input, source, target: targets, vars, cacheDir} = this.config;

        this.logger.setup(this.config);

        this.run = new Run(this.config);

        await getBaseHooks(this).BeforeAnyRun.promise(this.run);
        await getHooks(this).BeforeRun.promise(this.run);

        await this.run.prepareRun();

        const [files, skipped] = await this.run.getFiles();

        this.logger.skipped(skipped);

        for (const target of targets) {
            const stats = await seedTranslations({
                input,
                files: Array.from(files),
                sourceLanguage: source.language,
                targetLanguage: target.language,
                vars,
                cacheDir,
            });

            for (const file of stats.mismatched) {
                this.logger.warn(
                    file,
                    'Unit counts diverge between source and translation; the file was not seeded.',
                );
            }

            for (const [file, error] of stats.failed) {
                this.logger.warn(file, `Failed to seed the file: ${error}`);
            }

            this.logger.stat(
                `${source.language}-${target.language} ` +
                    `seeded-files: ${stats.seededFiles} seeded-units: ${stats.seededUnits} ` +
                    `skipped-units: ${stats.skippedUnits} ` +
                    `missing-targets: ${stats.missingTargets.length} ` +
                    `mismatched: ${stats.mismatched.length} ` +
                    `failed: ${stats.failed.length}`,
            );
        }
    }
}
