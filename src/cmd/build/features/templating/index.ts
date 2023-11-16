import type {Build} from '../../index';
import type {Command} from '../../../../config';

import {deprecated, defined, valuable} from '../../../../config/utils';
import {options} from './config';

const merge = (acc: Record<string, any>, ...sources: Record<string, any>[]) => {
    for (const source of sources) {
        for (const [key, value] of Object.entries(source)) {
            if (!acc[key] || !value) {
                acc[key] = value;
            } else if (typeof value === 'object') {
                acc[key] = merge({}, acc[key], value);
            }
        }
    }

    return acc;
};

export type TemplatingArgs = {
    template?: boolean | 'all' | 'text' | 'code';
    templateVars?: boolean;
    templateConditions?: boolean;
    disableLiquid?: boolean;
    resolveConditions?: boolean;
    conditionsInCode?: boolean;
    applyPresets?: boolean;
};

export type TemplatingConfig = {
    templating: {
        enabled: boolean;
        scopes: {
            text: boolean;
            code: boolean;
        };
        features: {
            substitutions: boolean;
            conditions: boolean;
            cycles: boolean;
        };
    };

    disableLiquid: boolean;
    resolveConditions: boolean;
    conditionsInCode: boolean;
    applyPresets: boolean;
};

export class Templating {
    apply(program: Build) {
        program.hooks.Command.tap('Templating', (command: Command) => {
            command
                .addOption(options.template)
                .addOption(options.noTemplate)
                .addOption(options.templateVars)
                .addOption(options.templateConditions)
                .addOption(options.disableLiquid)
                .addOption(options.applyPresets)
                .addOption(options.resolveConditions)
                .addOption(options.conditionsInCode);
        });

        program.hooks.Config.tap('Templating', (config, args: TemplatingArgs) => {
            const disableLiquid = defined('disableLiquid', args, config);
            const applyPresets = defined('applyPresets', args, config);
            const resolveConditions = defined('resolveConditions', args, config);
            const conditionsInCode = defined('conditionsInCode', args, config);
            const template = defined('template', args);
            const templateVars = defined('templateVars', args);
            const templateConditions = defined('templateConditions', args);

            config.templating = merge(
                {
                    enabled: true,
                    scopes: {
                        text: true,
                        code: false,
                    },
                    features: {
                        substitutions: true,
                        conditions: true,
                        cycles: true,
                    },
                },
                config.templating || {},
            );

            if (valuable(disableLiquid)) {
                config.templating.enabled = disableLiquid !== true;
            }

            if (valuable(conditionsInCode)) {
                config.templating.scopes.text = conditionsInCode === true;
            }

            if (valuable(applyPresets)) {
                config.templating.features.substitutions = applyPresets;
            }

            if (valuable(resolveConditions)) {
                config.templating.features.conditions = resolveConditions;
            }

            if (valuable(template)) {
                config.templating.enabled = template !== false;
                config.templating.scopes.text = ['all', 'text'].includes(template as string);
                config.templating.scopes.code = ['all', 'code'].includes(template as string);
            }

            if (valuable(templateVars)) {
                config.templating.features.substitutions = templateVars;
            }

            if (valuable(templateConditions)) {
                config.templating.features.conditions = templateConditions;
            }

            deprecated(config, 'disableLiquid', () => !config.templating.enabled);
            deprecated(config, 'applyPresets', () => config.templating.features.substitutions);
            deprecated(config, 'resolveConditions', () => config.templating.features.conditions);
            deprecated(config, 'conditionsInCode', () => config.templating.scopes.code);
        });
    }
}
