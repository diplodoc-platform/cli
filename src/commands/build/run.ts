import type {YfmArgv} from '~/models';

import {join, resolve} from 'path';
import {configPath} from '~/config';
import {
    BUNDLE_FOLDER,
    REDIRECTS_FILENAME,
    TMP_INPUT_FOLDER,
    TMP_OUTPUT_FOLDER,
    YFM_CONFIG_FILENAME,
} from '~/constants';
import {Logger} from '~/logger';
import {BuildConfig} from '.';

/**
 * This is transferable context for build command.
 * Use this context to communicate with lower data processing levels.
 */
export class Run {
    readonly originalInput: AbsolutePath;

    readonly originalOutput: AbsolutePath;

    readonly input: AbsolutePath;

    readonly output: AbsolutePath;

    readonly legacyConfig: YfmArgv;

    readonly logger: Logger;

    readonly config: BuildConfig;

    get bundlePath() {
        return join(this.originalOutput, BUNDLE_FOLDER);
    }

    get configPath() {
        return this.config[configPath] || join(this.config.input, YFM_CONFIG_FILENAME);
    }

    get redirectsPath() {
        return join(this.originalInput, REDIRECTS_FILENAME);
    }

    constructor(config: BuildConfig) {
        this.config = config;
        this.originalInput = config.input;
        this.originalOutput = config.output;

        // TODO: use root instead
        // We need to create system where we can safely work with original input.
        this.input = resolve(config.output, TMP_INPUT_FOLDER);
        this.output = resolve(config.output, TMP_OUTPUT_FOLDER);

        this.legacyConfig = {
            rootInput: this.originalInput,
            input: this.input,
            output: this.output,
            quiet: config.quiet,
            addSystemMeta: config.addSystemMeta,
            addMapFile: config.addMapFile,
            staticContent: config.staticContent,
            strict: config.strict,
            langs: config.langs,
            lang: config.lang,
            ignoreStage: config.ignoreStage,
            singlePage: config.singlePage,
            removeHiddenTocItems: config.removeHiddenTocItems,
            allowCustomResources: config.allowCustomResources,
            resources: config.resources,
            analytics: config.analytics,
            varsPreset: config.varsPreset,
            vars: config.vars,
            outputFormat: config.outputFormat,
            allowHTML: config.allowHtml,
            needToSanitizeHtml: config.sanitizeHtml,
            useLegacyConditions: config.useLegacyConditions,

            ignore: config.ignore,

            applyPresets: config.template.features.substitutions,
            resolveConditions: config.template.features.conditions,
            conditionsInCode: config.template.scopes.code,
            disableLiquid: !config.template.enabled,

            buildDisabled: config.buildDisabled,

            lintDisabled: !config.lint.enabled,
            // @ts-ignore
            lintConfig: config.lint.config,

            vcs: config.vcs,
            connector: config.vcs.connector,
            contributors: config.contributors,
            ignoreAuthorPatterns: config.ignoreAuthorPatterns,

            changelogs: config.changelogs,
            search: config.search,

            included: config.mergeIncludes,
        };

        this.logger = new Logger(config, [
            (_level, message) => message.replace(new RegExp(this.input, 'ig'), ''),
        ]);
    }
}
