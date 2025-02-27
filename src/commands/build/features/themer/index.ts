import type {Build} from '~/commands/build';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {resolve} from 'node:path';
import {THEME_CONFIG_FILENAME, THEME_CSS_PATH} from '~/constants';
import * as yaml from 'js-yaml';
import {getThemeValidator} from './validator';
import {ThemeConfig} from './types';
import {createCSS, createTheme, isThemeFileExists} from './utils';
import {defined} from '~/core/config';
import {options} from './config';

export type ThemerArgs = {
    theme: string | boolean;
};

export type ThemerConfig = {
    theme: string | boolean;
};

export class Themer {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('Themer', (command) => {
            command.addOption(options.themer);
        });

        getBaseHooks(program).Config.tap('Themer', (config, args) => {
            config.theme =
                isThemeFileExists(config.input) || defined('theme', args, config) || false;
            return config;
        });

        getBuildHooks(program).Run.tapPromise('Themer', async (run) => {
            if (!run.config.theme) return;
            try {
                const themeConfigRaw = isThemeFileExists(run.originalInput)
                    ? await run.read(resolve(run.input, THEME_CONFIG_FILENAME))
                    : run.config.theme.toString();

                const ThemeConfig = yaml.load(themeConfigRaw);

                const validate = getThemeValidator();

                if (validate(ThemeConfig)) {
                    const theme = createTheme(ThemeConfig as ThemeConfig);
                    const css = createCSS(theme);
                    run.write(resolve(run.originalOutput, THEME_CSS_PATH), css.trim());
                    run.logger.info('Theme applied');
                } else {
                    throw Error(
                        validate.errors
                            ? `Theme validation error: ${validate.errors[0].message}`
                            : 'Theme validation error',
                    );
                }
            } catch (e) {
                run.logger.error(e);
            }
        });
    }
}
