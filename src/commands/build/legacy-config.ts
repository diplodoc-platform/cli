import type {Run} from '.';
import type {YfmArgv} from '~/models';

export function legacyConfig(run: Run): YfmArgv {
    const {config} = run;

    return {
        rootInput: run.originalInput,
        input: run.input,
        output: run.output,
        staticContent: config.staticContent,
        langs: config.langs,
        lang: config.lang,
        singlePage: config.singlePage,
        outputFormat: config.outputFormat,
        allowHTML: config.allowHtml,
        needToSanitizeHtml: config.sanitizeHtml,

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
