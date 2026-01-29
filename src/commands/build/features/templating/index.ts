import type {Build} from '~/commands/build';
import type {Command} from '~/core/config';
import type {Preset} from '~/core/vars';
import {getHooks as getVarsHooks} from '~/core/vars';
import type {Run} from '~/commands/build/run';

import {dirname, join} from 'node:path';
import {dump} from 'js-yaml';
import {merge} from 'lodash';

import {getHooks as getVarsHooks} from '~/core/vars';
import {defined, valuable} from '~/core/config';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';

import {options} from './config';

export type TemplatingArgs = {
    template?: boolean | 'all' | 'text' | 'code';
    templateVars?: boolean;
    templateConditions?: boolean;
};

export type TemplatingConfig = {
    template: {
        enabled: boolean;
        keepNotVar: boolean;
        legacyConditions: boolean;
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
        getBaseHooks(program).Command.tap('Templating', (command: Command) => {
            command
                .addOption(options.template)
                .addOption(options.noTemplate)
                .addOption(options.templateVars)
                .addOption(options.templateConditions);
        });

        getBaseHooks(program).Config.tap('Templating', (config, args) => {
            const template = defined('template', args);
            const templateVars = defined('templateVars', args);
            const templateConditions = defined('templateConditions', args);

            config.template = merge(
                {
                    enabled: (config as TemplatingRawConfig).template !== false,
                    keepNotVar: false,
                    legacyConditions: false,
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

            if (!config.template.enabled) {
                config.template.features.substitutions = false;
                config.template.features.conditions = false;
            }

            return config;
        });

        getBuildHooks(program)
            .BeforeRun.for('md')
            .tap('Templating', (run) => {
                const {varsPreset, template} = run.config;
                const {substitutions, conditions} = template.features;

                // For case when we need to copy project from private to public repo and filter private presets.
                // Only copy presets.yaml files that are in directories with active TOC files (not ignored by stage filtering)
                if (!substitutions || !conditions) {
                    getVarsHooks(run.vars).PresetsLoaded.tapPromise(
                        'Templating',
                        async (presets, path) => {
                            // Copy all presets.yaml files initially, we'll clean up empty directories later
                            run.logger.info(`[DEBUG] Copying presets.yaml: ${path}`);

                            const scopes = [
                                {default: presets.default},
                                varsPreset !== 'default' &&
                                    presets[varsPreset] && {[varsPreset]: presets[varsPreset]},
                            ].filter(Boolean) as Preset[];
                            const result = scopes.reduce(
                                (result, scope) => Object.assign(result, scope),
                                {},
                            );

                            const yaml = dump(result, {
                                lineWidth: 120,
                            });
                            if (yaml !== '{}') {
                                await run.write(join(run.output, path), yaml, true);
                            }

                            return presets;
                        },
                    );
                }
            });

        // Add cleanup hook to remove directories that contain only presets.yaml files
        getBuildHooks(program)
            .AfterRun.for('md')
            .tapPromise('Templating', async (run) => {
                const {substitutions, conditions} = run.config.template.features;

                // Only clean up when we're copying presets.yaml files (when substitutions or conditions are disabled)
                if (!substitutions || !conditions) {
                    await this.cleanupEmptyDirectories(run);
                }
            });
    }

    /**
     * Clean up directories that contain only presets.yaml files (no other content)
     * This removes directories where TOC files were ignored by stage filtering
     */
    private async cleanupEmptyDirectories(run: Run): Promise<void> {
        try {
            // Get all presets.yaml files that were copied using glob
            const presetsFiles = await run.glob('**/presets.yaml', {
                cwd: run.output,
            });

            // For each presets.yaml file, check if its directory contains only this file
            for (const presetsPath of presetsFiles) {
                const dir = dirname(presetsPath);
                const entries = await run.fs.readdir(dir, {withFileTypes: true});

                // Filter out hidden files and directories
                const visibleEntries = entries.filter(
                    (entry: any) => !entry.name.startsWith('.') && entry.name !== 'presets.yaml',
                );

                // If directory contains only presets.yaml (no other visible files/directories)
                if (visibleEntries.length === 0) {
                    run.logger.info(
                        `[DEBUG] Removing empty directory: ${dir} (contains only presets.yaml)`,
                    );

                    // Remove the presets.yaml file first
                    await run.fs.unlink(presetsPath);

                    // Then try to remove the directory (it should be empty now)
                    try {
                        await run.fs.rmdir(dir);
                    } catch (error) {
                        // Directory might not be empty due to hidden files, ignore this error
                        run.logger.info(`[DEBUG] Could not remove directory ${dir}: ${error}`);
                    }
                }
            }
        } catch (error) {
            run.logger.warn(`[DEBUG] Error during cleanup: ${error}`);
        }
    }
}
