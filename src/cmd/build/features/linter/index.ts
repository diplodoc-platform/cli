import type {Build} from '~/cmd';
import type {Command} from '~/config';
import {resolve} from 'node:path';
import {defined, resolveConfig} from '~/config';
import {LINT_CONFIG_FILENAME} from '~/constants';
import {options} from './config';

export type LintArgs = {
    lintDisabled: boolean;
};

export type LintConfig = {
    lintDisabled: boolean;
    lintConfig: {
        'log-levels': Record<string, string>;
    };
};

// TODO(major): move to separated 'lint' command
export class Lint {
    apply(program: Build) {
        program.hooks.Command.tap('Contributors', (command: Command) => {
            command.addOption(options.lintDisabled);
        });

        program.hooks.Config.tapPromise('Contributors', async (config, args) => {
            config.lintDisabled = defined('lintDisabled', args, config) || false;

            if (!config.lintDisabled) {
                const lintConfig = await resolveConfig<Partial<LintConfig['lintConfig']>>(
                    resolve(args.input, LINT_CONFIG_FILENAME),
                    {
                        fallback: {},
                    },
                );

                lintConfig['log-levels'] = lintConfig['log-levels'] || {};
                lintConfig['log-levels']['MD033'] = config.allowHtml ? 'disabled' : 'error';

                config.lintConfig = lintConfig as LintConfig['lintConfig'];
            }

            return config;
        });
    }
}
