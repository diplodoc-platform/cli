import type {Run} from '.';
import type {YfmArgv} from '~/models';

export function legacyConfig(run: Run): YfmArgv {
    const {config} = run;

    return {
        rootInput: run.originalInput,
        allowHTML: config.allowHtml,
        needToSanitizeHtml: config.sanitizeHtml,
        useLegacyConditions: config.useLegacyConditions,
        supportGithubAnchors: Boolean(config.supportGithubAnchors),

        applyPresets: config.template.features.substitutions,
        resolveConditions: config.template.features.conditions,
        conditionsInCode: config.template.scopes.code,
        disableLiquid: !config.template.enabled,

        lintDisabled: !config.lint.enabled,
        // @ts-ignore
        lintConfig: config.lint.config,
    };
}
