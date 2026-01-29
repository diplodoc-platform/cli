import type {Build, Run} from '~/commands/build';
import type {Command} from '~/core/config';

import {join} from 'node:path';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {defined} from '~/core/config';
import {THEME_ASSETS_PATH} from '~/constants';

import {options} from './config';
import {generateThemeCss} from './utils';

export type {ThemerArgs, ThemerConfig} from './types';

export class Themer {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('Themer', (command: Command) => {
            command.addOption(options.theme);
        });

        getBaseHooks(program).Config.tap('Themer', (config, args) => {
            const theme = defined('theme', args);
            config.theme = theme ? String(theme) : null;

            return config;
        });

        const writeThemeCssToAssets = async (run: Run) => {
            try {
                const css = await generateThemeCss(run);
                if (css) {
                    const outputPath = join(run.output, THEME_ASSETS_PATH);
                    await run.write(outputPath, css, true);
                }
            } catch (error) {
                run.logger.error(`Failed to generate theme: ${error}`);
            }
        };

        getBuildHooks(program).BeforeRun.for('html').tapPromise('Themer', writeThemeCssToAssets);

        getBuildHooks(program).BeforeRun.for('md').tapPromise('Themer', writeThemeCssToAssets);
    }
}
