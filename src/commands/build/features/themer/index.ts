import type {Build} from '~/commands/build';
import {getHooks as getBuildHooks} from '~/commands/build';

import {resolve} from 'node:path';
import {THEME_CONFIG_FILENAME, THEME_CSS_PATH} from '~/constants';
import * as yaml from 'js-yaml';
import {getThemeValidator} from './validator';
import {ThemeConfig} from './types';
import {createCSS, createTheme, isThemeExists} from './utils';

export class Themer {
    apply(program: Build) {
        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('Themer', async (run) => {
                if (!isThemeExists(run.input)) return;
                try {
                    const config = await run
                        .read(resolve(run.input, THEME_CONFIG_FILENAME))
                        .then((data) => yaml.load(data));

                    const validate = getThemeValidator();

                    if (validate(config)) {
                        const theme = createTheme(config as ThemeConfig);
                        const css = createCSS(theme);
                        run.write(resolve(run.originalOutput, THEME_CSS_PATH), css);
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

        getBuildHooks(program)
            .AfterRun.for('md')
            .tapPromise('Themer', async (run) => {
                if (isThemeExists(run.input)) {
                    await run.copy(
                        resolve(run.input, THEME_CONFIG_FILENAME),
                        resolve(run.originalOutput, THEME_CONFIG_FILENAME),
                    );
                }
            });
    }
}
