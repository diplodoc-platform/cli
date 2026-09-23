import type {BaseArgs, ICallable} from '~/core/program';
import type {CodeMode, Locale, VarsResolver} from './utils';
import type {ConfigDefaults} from './utils/config';

import {ok} from 'assert';
import {resolve} from 'node:path';
import {pick} from 'lodash';
import {escape as escapeGlob} from 'minimatch';

import {
    BaseProgram,
    getHooks as getBaseHooks,
    withConfigDefaults,
    withConfigScope,
} from '~/core/program';
import {Command, args, defined} from '~/core/config';
import {YFM_CONFIG_FILENAME} from '~/constants';
import {own} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {DESCRIPTION, NAME, options} from './config';
import {Extract} from './commands/extract';
import {Compose} from './commands/compose';
import {Seed} from './commands/seed';
import {Extension as YandexTranslation} from './providers/yandex';
import {Extension as AITranslation} from './providers/ai';
import {
    copyAssets,
    resolveCodeMode,
    resolveSource,
    resolveTargets,
    resolveVars,
    resolveVarsPreset,
    resolveVcsDiffFiles,
} from './utils';
import {Run} from './run';
import {configDefaults} from './utils/config';
import {Extension as ExtractOpenapiIncluderFakeExtension} from './extract-openapi';

export {getHooks};
export {TRANSLATE_REPORT_SCHEMA_VERSION} from './report';
export type {
    TranslateRunReport,
    TranslateReportStatus,
    TranslateReportCounters,
    TranslateReportTarget,
    TranslateReportJudge,
    TranslateReportError,
} from './report';

export interface IProvider {
    skip(files: [string, string][], config: TranslateConfig): Promise<void>;
    translate(files: string[], config: TranslateConfig): Promise<void>;
}

export type TranslateArgs = BaseArgs & {
    output: AbsolutePath;
    provider: string;
    source?: string;
    target?: string | string[];
    include?: string[];
    exclude?: string[];
    includeVcsDiff?: string | boolean;
    vars?: Hash;
    presets?: boolean;
    varsPreset?: string;
    code?: CodeMode;
    copyAssets?: boolean;
    report?: string;
};

export type TranslateConfig = Pick<BaseArgs, 'input' | 'strict' | 'quiet'> & {
    output: AbsolutePath;
    provider: string;
    source: Locale;
    target: Locale[];
    include: string[];
    exclude: string[];
    includeVcsDiff?: string | boolean;
    files: string[];
    skipped: [string, string][];
    vars: Hash;
    /**
     * Vars of a file: the presets on its path under `vars`. Set by the run
     * once presets are loaded; providers fall back to `vars` without it.
     */
    varsFor?: VarsResolver;
    /** Apply presets.yaml to conditions, see `--presets`. Off when unset (extract). */
    presets?: boolean;
    /** Code processing mode. Unset until the provider applies its default. */
    code?: CodeMode;
    dryRun: boolean;
    copyAssets: boolean;
    timeout: number;
    /** Absolute path of the JSON run report. Not written when unset. */
    report?: AbsolutePath;
} & ConfigDefaults;

@withHooks
@withConfigScope(NAME, {strict: true})
@withConfigDefaults(configDefaults)
export class Translate extends BaseProgram<TranslateConfig, TranslateArgs> {
    readonly name = 'Translate';

    readonly command = new Command(NAME)
        .description(DESCRIPTION)
        .helpOption(false)
        .allowUnknownOption(true);

    readonly options = [
        options.input('./'),
        options.output(),
        options.provider,
        options.source,
        options.target,
        options.files,
        options.include,
        options.exclude,
        options.includeVcsDiff,
        options.vars,
        options.presets,
        options.varsPreset,
        options.code,
        options.dryRun,
        options.copyAssets,
        options.timeout,
        options.report,
        options.config(YFM_CONFIG_FILENAME),
    ];

    readonly provider: IProvider | undefined;

    readonly extract = new Extract();

    readonly compose = new Compose();

    readonly seed = new Seed();

    protected readonly modules: ICallable[] = [
        this.extract,
        this.compose,
        this.seed,
        new YandexTranslation(),
        new AITranslation(),
        new ExtractOpenapiIncluderFakeExtension(),
    ];

    private run!: Run;

    private vcsDiffFiles?: NormalizedPath[];

    apply(program?: BaseProgram) {
        super.apply(program);

        getBaseHooks(this).Config.tapPromise('Translate', async (config, args) => {
            const {input, output, quiet, strict} = pick(args, [
                'input',
                'output',
                'quiet',
                'strict',
            ]) as TranslateArgs;
            const source = resolveSource(config, args);
            const target = resolveTargets(config, args);
            const include = defined('include', args, config) || [];
            const exclude = defined('exclude', args, config) || [];
            const includeVcsDiff = defined('includeVcsDiff', args, config) || false;
            const files = defined('files', args, config);
            const vars = resolveVars(config, args);
            const presets = defined('presets', args, config) || false;
            // The translate section, then the .yfm root where build keeps it.
            const varsPreset = await resolveVarsPreset(config, args, ['translate', '']);

            // CLI report paths are resolved from cwd, config values from the config dir.
            let report: AbsolutePath | undefined;
            if (own<string, 'report'>(args, 'report')) {
                report = resolve(args.report) as AbsolutePath;
            } else if (own<string, 'report'>(config, 'report')) {
                report = config.resolve
                    ? config.resolve(config.report)
                    : (resolve(config.report) as AbsolutePath);
            }

            return Object.assign(config, {
                input,
                output: output || input,
                quiet,
                strict,
                source,
                files,
                target,
                include,
                exclude,
                includeVcsDiff,
                vars,
                presets,
                varsPreset,
                code: resolveCodeMode(args, config),
                provider: defined('provider', args, config),
                dryRun: defined('dryRun', args, config) || false,
                copyAssets: defined('copyAssets', args, config) || false,
                report,
                // No global default here: each provider applies its own
                // (5s for yandex, 60s for LLM providers).
                timeout: defined('timeout', args, config) as number,
            });
        });
    }

    async action() {
        if (this.config.includeVcsDiff) {
            const changed = this.getVcsDiffFiles();
            const {include, files} = this.config;

            if (!changed.length && !include.length && !files?.length) {
                this.logger.info('No VCS changes found, nothing to translate.');
                return;
            }

            this.config.include = include.concat(changed.map((file) => escapeGlob(file)));
        }

        this.run = new Run(this.config, {usePresets: this.config.presets});

        await getBaseHooks(this).BeforeAnyRun.promise(this.run);

        await this.run.prepareRun();
        const [files, skipped] = await this.run.getFiles();

        // Presets are loaded by now: hand providers the per-file vars.
        this.config.varsFor = (path, target) => this.run.varsFor(path, target);

        if (this.provider) {
            await this.provider.skip(skipped, this.config);
            await this.provider.translate(files, this.config);

            if (this.config.copyAssets && !this.config.dryRun) {
                copyAssets(this.config);
            }

            return;
        }

        // @ts-ignore
        this['provider'] = await getHooks(this)
            .Provider.for(this.config.provider)
            .promise(undefined, this.config);

        ok(
            this.provider,
            `Translation provider with name '${this.config.provider}' is not resolved`,
        );

        await getBaseHooks(this).Command.promise(this.command, this.options);

        this.command.helpOption(true).allowUnknownOption(false);

        await this.parse(args(this.command));
    }

    private getVcsDiffFiles(): NormalizedPath[] {
        if (!this.vcsDiffFiles) {
            const ref =
                typeof this.config.includeVcsDiff === 'string'
                    ? this.config.includeVcsDiff
                    : undefined;

            this.vcsDiffFiles = resolveVcsDiffFiles(this.config.input, ref);
        }

        return this.vcsDiffFiles;
    }
}
