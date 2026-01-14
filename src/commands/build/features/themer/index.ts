import type {Build, Run} from '~/commands/build';
import type {Command} from '~/core/config';

import {join} from 'node:path';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {defined} from '~/core/config';

import {THEME_ASSETS_PATH} from '~/constants';

import {options} from './config';
import {generateThemeCss} from './utils';
import type {ThemerArgs, ThemerConfig} from './types';

export type {ThemerArgs, ThemerConfig};

export class Themer {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('Themer', (command: Command) => {
            command.addOption(options.theme);
        });

        getBaseHooks(program).Config.tap('Themer', (config, args) => {
            const theme = defined('theme', args, config);
            config.theme = theme ? String(theme) : undefined;

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

        (['html', 'md']).forEach((format) => {
            getBuildHooks(program)
                .BeforeRun.for(format)
                .tapPromise('Themer', writeThemeCssToAssets);
        });
    }
}
