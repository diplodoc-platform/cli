import type {Build} from '~/commands';
import type {Command} from '~/config';
import {defined, valuable} from '~/config';
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
};

export type TemplatingRawConfig = {
    template: boolean | DeepPartial<TemplatingConfig['template']>;
};

export class Templating {
    apply(program: Build) {
        program.hooks.Command.tap('Templating', (command: Command) => {
            command
                .addOption(options.template)
                .addOption(options.noTemplate)
                .addOption(options.templateVars)
                .addOption(options.templateConditions);
        });

        program.hooks.Config.tap('Templating', (config, args) => {
            const template = defined('template', args);
            const templateVars = defined('templateVars', args);
            const templateConditions = defined('templateConditions', args);

            config.template = merge(
                {
                    enabled: (config as TemplatingRawConfig).template !== false,
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

            return config;
        });
    }
}
