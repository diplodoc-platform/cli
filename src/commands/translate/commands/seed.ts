import type {BaseArgs} from '~/core/program';
import type {Config} from '~/core/config';
import type {CodeMode, Locale, VarsResolver} from '../utils';
import type {ConfigDefaults} from '../utils/config';
import type {AlignedUnits} from '../providers/ai/utils';

import {existsSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';
import {pick} from 'lodash';
import {asyncify, eachLimit} from 'async';

import {YFM_CONFIG_FILENAME} from '~/constants';
import {Command, configPath, defined, resolveConfig, scope} from '~/core/config';
import {normalizePath} from '~/core/utils';
import {
    BaseProgram,
    getHooks as getBaseHooks,
    withConfigDefaults,
    withConfigScope,
} from '~/core/program';

import {options} from '../config';
import {TranslateLogger} from '../logger';
import {TranslateError, languageRepath, loadTranslationUnits, resolveCodeMode} from '../utils';
import {SeedStore, alignTranslationUnits, seedFilePath} from '../providers/ai/utils';
import {options as aiOptions} from '../providers/ai/config';
import {Run} from '../run';
import {
    configDefaults,
    resolveSource,
    resolveTargets,
    resolveVars,
    resolveVarsPreset,
} from '../utils/config';
import {Extension as ExtractOpenapiIncluderFakeExtension} from '../extract-openapi';

import {getHooks, withHooks} from './hooks';

const MAX_CONCURRENCY = 50;

export type SeedParams = {
    input: AbsolutePath;
    /** Input-relative paths of source language files. */
    files: string[];
    sourceLanguage: string;
    targetLanguage: string;
    /** Flat vars for every file; `varsFor` takes precedence. */
    vars?: Hash;
    /** Vars of a source file; the target file takes the same vars, or the units diverge. */
    varsFor?: VarsResolver;
    /** Must match the code mode of the translate run, or the cache keys diverge. LLM default when unset. */
    code?: CodeMode;
    cacheDir: AbsolutePath;
};

export type SeedPartial = {
    file: string;
    /** Source units without a counterpart in the translation. */
    unseeded: number;
    /** Source units in total. */
    units: number;
};

export type SeedStats = {
    /** Files that contributed at least one pair, partially seeded ones included. */
    seededFiles: number;
    seededUnits: number;
    skippedUnits: number;
    missingTargets: string[];
    /** Files whose translation aligned with the source only in part. */
    partial: SeedPartial[];
    unseededUnits: number;
    /** Pairs kept for their file only, out of the shared dictionary. */
    doubtfulUnits: number;
    /** Files whose translation did not align with the source at all. */
    mismatched: string[];
    /** Files whose source or target failed to load or extract. */
    failed: [string, string][];
};

/**
 * Derives translation cache seeds from existing target files.
 *
 * For every source file whose translation exists, both sides are split
 * into units the same way the translate run does and aligned block by
 * block (see `alignTranslationUnits`); the aligned pairs become cache
 * entries, so a following translate run reuses the existing translations
 * and only sends changed units to the LLM. A block whose translation
 * diverged is left out on its own; the rest of the file is still seeded.
 */
export async function seedTranslations(params: SeedParams): Promise<SeedStats> {
    const {
        input,
        files,
        sourceLanguage,
        targetLanguage,
        vars: flatVars = {},
        varsFor = () => flatVars,
        code = 'adaptive',
        cacheDir,
    } = params;

    const inputRoot = resolve(input);
    const repath = languageRepath({
        inputRoot,
        outputRoot: inputRoot,
        sourceLanguage,
        targetLanguage,
    });
    const languages = {source: sourceLanguage, target: targetLanguage};
    const seeds = new SeedStore(seedFilePath(cacheDir, sourceLanguage, targetLanguage));

    const stats: SeedStats = {
        seededFiles: 0,
        seededUnits: 0,
        skippedUnits: 0,
        missingTargets: [],
        partial: [],
        unseededUnits: 0,
        doubtfulUnits: 0,
        mismatched: [],
        failed: [],
    };

    const aligned = new Map<string, AlignedUnits & {units: number}>();

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
                const result = await alignFile(file, inputPath, targetPath);
                if (result) {
                    aligned.set(file, result);
                }
            } catch (error) {
                // One broken file (unparseable target markup, bad
                // frontmatter, ...) must not kill the whole seeding run:
                // the file is reported and falls back to a full
                // retranslation, exactly like a translation that does not
                // align.
                stats.failed.push([file, String(error)]);
            }
        }),
    );

    // Files are recorded in their given order, not in completion order:
    // the dictionary breaks ties between wordings by the first recorded
    // one, and a seed must not change between two runs on the same input.
    for (const file of files) {
        const result = aligned.get(file);
        if (!result) {
            continue;
        }

        if (!result.pairs.length && result.unseeded) {
            stats.mismatched.push(file);
            continue;
        }

        seeds.record(file, result.pairs);

        stats.seededFiles++;
        stats.seededUnits += result.pairs.length;
        stats.skippedUnits += result.skipped;
        stats.doubtfulUnits += result.doubtful;

        if (result.unseeded) {
            stats.partial.push({file, unseeded: result.unseeded, units: result.units});
            stats.unseededUnits += result.unseeded;
        }
    }

    seeds.flush();

    return stats;

    async function alignFile(
        file: string,
        inputPath: AbsolutePath,
        targetPath: AbsolutePath,
    ): Promise<(AlignedUnits & {units: number}) | undefined> {
        // Both sides take the vars of the source file: the translation was
        // produced under them, and a different preset on the target side
        // would keep or drop other conditional blocks and misalign the units.
        const vars = varsFor(file);
        const source = await loadTranslationUnits({
            inputPath,
            path: file,
            sourceLanguage,
            targetLanguage,
            vars,
            code,
        });

        if (!source.units.length) {
            return undefined;
        }

        const target = await loadTranslationUnits({
            inputPath: targetPath,
            path: relative(inputRoot, targetPath),
            sourceLanguage: targetLanguage,
            targetLanguage: sourceLanguage,
            vars,
            code,
        });

        return {...alignTranslationUnits(source, target, languages), units: source.units.length};
    }
}

/**
 * The seed section is nested in `translate`, so a code mode set for the
 * translate run one level up applies to seeding as well.
 */
async function inheritPresets(config: Config<Hash>): Promise<boolean> {
    const path = config[configPath];

    if (!path) {
        return false;
    }

    const parent = await resolveConfig(path, {filter: scope('translate'), fallback: {}});

    return Boolean(parent.presets);
}

async function inheritCodeMode(config: Config<Hash>): Promise<CodeMode | undefined> {
    const path = config[configPath];

    if (!path) {
        return undefined;
    }

    const parent = await resolveConfig(path, {filter: scope('translate')});

    return resolveCodeMode({}, parent);
}

export type SeedArgs = BaseArgs & {
    source?: string;
    target?: string | string[];
    include?: string[];
    exclude?: string[];
    vars?: Hash;
    presets?: boolean;
    varsPreset?: string;
    code?: CodeMode;
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
    /** Apply presets.yaml to conditions; must match the translate run. */
    presets: boolean;
    code: CodeMode;
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
        options.presets,
        options.varsPreset,
        options.code,
        options.config(YFM_CONFIG_FILENAME),
        aiOptions.cacheDir,
    ];

    // Toc processing must not choke on openapi includer declarations:
    // the stub is applied per-subcommand (hooks are not inherited from
    // the parent Translate program), same as in Extract.
    readonly modules = [new ExtractOpenapiIncluderFakeExtension()];

    readonly logger = new TranslateLogger();

    private run!: Run;

    apply(program?: BaseProgram) {
        super.apply(program);

        getBaseHooks(this).Config.tapPromise('Translate.Seed', async (config, args) => {
            const {input, quiet, strict} = pick(args, ['input', 'quiet', 'strict']) as SeedArgs;
            const source = resolveSource(config, args);
            const target = resolveTargets(config, args);
            const include = defined('include', args, config) || [];
            const exclude = defined('exclude', args, config) || [];
            const files = defined('files', args, config) || [];
            const vars = resolveVars(config, args);
            // Seeds must split files exactly like the translate run, so the
            // switch follows the translate section when the seed section is silent.
            const presets = defined('presets', args, config) ?? (await inheritPresets(config));
            // The seed section, then the translate section, then the .yfm root.
            const varsPreset = await resolveVarsPreset(config, args, [
                'translate.seed',
                'translate',
                '',
            ]);
            // Seeds feed the LLM cache, so they follow the translate section
            // of the config and then the LLM default.
            const code =
                resolveCodeMode(args, config) ?? (await inheritCodeMode(config)) ?? 'adaptive';
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
                presets,
                varsPreset,
                code,
                cacheDir: resolve(cacheDir),
            });
        });
    }

    async action() {
        const {input, source, target: targets, code, cacheDir} = this.config;

        this.logger.setup(this.config);

        this.run = new Run(this.config, {usePresets: this.config.presets});

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
                varsFor: (path) => this.run.vars.for(normalizePath(path)),
                code,
                cacheDir,
            });

            for (const {file, unseeded, units} of stats.partial) {
                this.logger.warn(
                    file,
                    `Existing translation diverges in ${unseeded} of ${units} units; they were not seeded.`,
                );
            }

            for (const file of stats.mismatched) {
                this.logger.warn(
                    file,
                    'Existing translation does not align with the source; the file was not seeded.',
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
                    `failed: ${stats.failed.length} ` +
                    `partial-files: ${stats.partial.length} ` +
                    `unseeded-units: ${stats.unseededUnits} ` +
                    `doubtful-units: ${stats.doubtfulUnits}`,
            );
        }
    }
}
