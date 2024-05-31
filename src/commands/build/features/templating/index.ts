import type {Build} from '~/commands';
import type {Command} from '~/config';
import get from 'lodash/get';
import {defined, deprecated, valuable} from '~/config';
import {options} from './config';

const merge = (acc: Hash, ...sources: Hash[]) => {
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
    template: {
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

        program.hooks.Config.tap('Templating', (config, args) => {
            const disableLiquid = defined('disableLiquid', args, config);
            const applyPresets = defined('applyPresets', args, config);
            const resolveConditions = defined('resolveConditions', args, config);
            const conditionsInCode = defined('conditionsInCode', args, config);
            const template = defined('template', args);
            const templateVars = defined('templateVars', args);
            const templateConditions = defined('templateConditions', args);

            config.template = merge(
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
                config.template || {},
            ) as TemplatingConfig['template'];

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

            if (valuable(template)) {
                config.template.enabled = template !== false;

                config.template.scopes.text = ['all', 'text'].includes(template as string);
                config.template.scopes.code = ['all', 'code'].includes(template as string);
            }

            if (valuable(templateVars)) {
                config.template.features.substitutions = templateVars;
            }

            if (valuable(templateConditions)) {
                config.template.features.conditions = templateConditions;
            }

            deprecated(config, 'disableLiquid', () => !get(config, 'template.enabled'));
            deprecated(config, 'applyPresets', () =>
                get(config, 'template.features.substitutions'),
            );
            deprecated(config, 'resolveConditions', () =>
                get(config, 'template.features.conditions'),
            );
            deprecated(config, 'conditionsInCode', () => get(config, 'template.scopes.code'));

            return config;
        });
    }
}
