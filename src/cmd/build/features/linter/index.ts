import type {Build} from '~/cmd';
import type {Command} from '~/config';
import {resolve} from 'node:path';
import {defined, option, resolveConfig} from '~/config';
import {LINT_CONFIG_FILENAME} from '~/constants';

const lintDisabled = option({
    flags: '--lint-disabled',
    desc: 'Disable linting.',
});

export class Linter {
    apply(program: Build) {
        program.hooks.Command.tap('Contributors', (command: Command) => {
            command.addOption(lintDisabled);
        });

        program.hooks.Config.tap('Contributors', async (config, args) => {
            config.lintDisabled = defined('lintDisabled', args, config) || false;

            if (!config.lintDisabled) {
                config.lintConfig = resolveConfig(resolve(args.input, LINT_CONFIG_FILENAME), {
                    fallback: {}
                });

                config.lintConfig['log-levels'] = config.lintConfig['log-levels'] || {};
                config.lintConfig['log-levels']['MD033'] = config.allowHtml ? 'disabled' : 'error';
            }

            return config;
        });
    }
}
