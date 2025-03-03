import type {Build} from '~/commands/build';
import type {Command} from '~/core/config';

import {getHooks as getBaseHooks} from '~/core/program';
import {defined, valuable} from '~/core/config';
import {options} from './config';

export type LegacyArgs = {
    disableLiquid?: boolean;
    resolveConditions?: boolean;
    conditionsInCode?: boolean;
    applyPresets?: boolean;

    lintDisabled?: boolean;
    allowHTML?: boolean;
    needToSanitizeHtml?: boolean;
};

export type LegacyRawConfig = {
    disableLiquid: boolean;
    resolveConditions: boolean;
    conditionsInCode: boolean;
    applyPresets: boolean;

    lintDisabled: boolean;
    allowHTML: boolean;
    needToSanitizeHtml: boolean;
};

export type LegacyConfig = {};

export class Legacy {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('Legacy', (command: Command) => {
            command
                .addOption(options.disableLiquid)
                .addOption(options.applyPresets)
                .addOption(options.resolveConditions)
                .addOption(options.conditionsInCode)
                .addOption(options.lintDisabled)
                .addOption(options.allowHTML)
                .addOption(options.needToSanitizeHtml);
        });

        getBaseHooks(program).Config.tap('Legacy', (config, args) => {
            const disableLiquid = defined('disableLiquid', args, config);
            const applyPresets = defined('applyPresets', args, config);
            const resolveConditions = defined('resolveConditions', args, config);
            const conditionsInCode = defined('conditionsInCode', args, config);
            const lintDisabled = defined('lintDisabled', args, config);
            const allowHTML = defined('allowHTML', args, config);
            const needToSanitizeHtml = defined('needToSanitizeHtml', args, config);

            if (valuable(disableLiquid)) {
                config.template.enabled = disableLiquid !== true;
            }

            if (valuable(conditionsInCode)) {
                config.template.scopes.code = conditionsInCode === true;
            }

            if (valuable(applyPresets)) {
                config.template.features.substitutions = applyPresets;
            }

            if (valuable(resolveConditions)) {
                config.template.features.conditions = resolveConditions;
            }

            if (valuable(lintDisabled)) {
                config.lint.enabled = lintDisabled !== true;
            }

            if (valuable(allowHTML)) {
                config.allowHtml = allowHTML;
                config.lint.config['log-levels']['MD033'] = allowHTML ? 'disabled' : 'error';
            }

            if (valuable(needToSanitizeHtml)) {
                config.sanitizeHtml = needToSanitizeHtml;
            }

            for (const prop of [
                'disableLiquid',
                'applyPresets',
                'resolveConditions',
                'conditionsInCode',
                'lintDisabled',
                'allowHTML',
                'needToSanitizeHtml',
            ]) {
                // @ts-ignore
                delete config[prop];
            }

            return config;
        });
    }
}
