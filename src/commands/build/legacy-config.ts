import type {Run} from '.';
import type {YfmArgv} from '~/models';

export function legacyConfig(run: Run): YfmArgv {
    const {config} = run;

    return {
        rootInput: run.originalInput,
        input: run.input,
        output: run.output,
        quiet: config.quiet || false,
        addSystemMeta: config.addSystemMeta,
        addMapFile: config.addMapFile,
        staticContent: config.staticContent,
        strict: config.strict || false,
        langs: config.langs,
        lang: config.lang,
        singlePage: config.singlePage,
        analytics: config.analytics,
        outputFormat: config.outputFormat,
        allowHTML: config.allowHtml,
        needToSanitizeHtml: config.sanitizeHtml,
        useLegacyConditions: config.useLegacyConditions,

        ignore: config.ignore,

        applyPresets: config.template.features.substitutions,
        resolveConditions: config.template.features.conditions,
        conditionsInCode: config.template.scopes.code,
        disableLiquid: !config.template.enabled,

        lintDisabled: !config.lint.enabled,
        // @ts-ignore
        lintConfig: config.lint.config,

        changelogs: config.changelogs,

        included: config.mergeIncludes,
    };
}
