import type {Run} from '.';
import type {YfmArgv} from '~/models';

export function legacyConfig(run: Run): YfmArgv {
    const {config} = run;

    return {
        rootInput: run.originalInput,
        input: run.input,
        output: run.output,
        allowHTML: config.allowHtml,
        needToSanitizeHtml: config.sanitizeHtml,
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
