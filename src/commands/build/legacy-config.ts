import type {Run} from '.';
import type {YfmArgv} from '~/models';

export function legacyConfig(run: Run): YfmArgv {
    const {config} = run;

    return {
        rootInput: run.originalInput,
        input: run.input,
        output: run.output,
        quiet: config.quiet,
        addSystemMeta: config.addSystemMeta,
        addMapFile: config.addMapFile,
        staticContent: config.staticContent,
        strict: config.strict,
        langs: config.langs,
        lang: config.lang,
        ignoreStage: config.ignoreStage[0],
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
}
