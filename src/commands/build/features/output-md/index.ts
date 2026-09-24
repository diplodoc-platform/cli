import type {Build} from '~/commands/build';
import type {Command} from '~/core/config';

import {join} from 'node:path';

import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {configPath, defined} from '~/core/config';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getMetaHooks} from '~/core/meta';
import {getHooks as getLeadingHooks} from '~/core/leading';

import {getCustomCollectPlugins} from './utils';
import {MarkdownOutputRenderer, prepareMarkdownMeta} from './renderer';
import {options} from './config';

export type OutputMdArgs = {
    hashIncludes: boolean;
    mergeIncludes: boolean;
    mergeAutotitles: boolean;
    mergeSvg: boolean;
    keepNotVar: boolean;
    legacyConditions: boolean;
    mergeIncludesSourceMaps: boolean;
};

export type OutputMdConfig = {
    hashIncludes: boolean;
    mergeIncludes: boolean;
    mergeAutotitles: boolean;
    mergeSvg: boolean;
    disableMetaMaxLineWidth: boolean;
    mergeIncludesSourceMaps: boolean;
};

export type PreprocessConfig = {
    template: {
        keepNotVar: boolean;
        legacyConditions: boolean;
    };
    preprocess: Partial<OutputMdConfig>;
};

export class OutputMd {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('Build.Md', (command: Command) => {
            command.addOption(options.hashIncludes);
            command.addOption(options.mergeIncludes);
            command.addOption(options.mergeAutotitles);
            command.addOption(options.mergeSvg);
            command.addOption(options.keepNotVar);
            command.addOption(options.disableMetaMaxLineWidth);
            command.addOption(options.legacyConditions);
            command.addOption(options.mergeIncludesSourceMaps);
        });

        getBaseHooks(program).Config.tap('Build.Md', (config, args) => {
            const hashIncludes = defined('hashIncludes', args, config.preprocess || {}, {
                hashIncludes: true,
            });
            const mergeIncludes = defined('mergeIncludes', args, config.preprocess || {}, {
                mergeIncludes: true,
            });
            const mergeAutotitles = defined('mergeAutotitles', args, config.preprocess || {}, {
                mergeAutotitles: true,
            });
            const mergeSvg = defined('mergeSvg', args, config.preprocess || {}, {
                mergeSvg: true,
            });
            const keepNotVar = defined('keepNotVar', args, config || {}, {
                keepNotVar: false,
            });
            const legacyConditions = defined('legacyConditions', args, config || {}, {
                legacyConditions: false,
            });
            const disableMetaMaxLineWidth = defined('disableMetaMaxLineWidth', args, config || {}, {
                disableMetaMaxLineWidth: false,
            });
            const mergeIncludesSourceMaps = defined(
                'mergeIncludesSourceMaps',
                args,
                config.preprocess || {},
                {
                    mergeIncludesSourceMaps: true,
                },
            );
            return Object.assign(config, {
                template: {
                    ...config.template,
                    keepNotVar,
                    legacyConditions,
                },
                preprocess: {
                    hashIncludes,
                    mergeIncludes,
                    mergeAutotitles,
                    mergeSvg,
                    disableMetaMaxLineWidth,
                    mergeIncludesSourceMaps,
                },
            });
        });

        getBuildHooks(program)
            .BeforeRun.for('md')
            .tap('Build.Md', (run) => {
                getMarkdownHooks(run.markdown).Collects.tap('Build.Md', (collects) => {
                    return collects.concat(getCustomCollectPlugins());
                });

                const renderer = new MarkdownOutputRenderer(run);

                getMetaHooks(run.meta).Dump.tap('Build.Md', (meta, file) => {
                    return prepareMarkdownMeta(run, meta, file);
                });

                getMarkdownHooks(run.markdown).Dump.tapPromise(
                    {name: 'Build.Md', stage: -Infinity},
                    (vfile) => renderer.collectMarkdown(vfile),
                );

                getMarkdownHooks(run.markdown).Dump.tapPromise('Build.Md', (vfile) =>
                    renderer.finalizeMarkdown(vfile),
                );

                getLeadingHooks(run.leading).Dump.tapPromise('Build.Md', (vfile) =>
                    renderer.renderLeading(vfile),
                );
            });

        getBuildHooks(program)
            .AfterRun.for('md')
            .tapPromise('Build.Md', async (run) => {
                // TODO: save normalized config instead
                if (run.config[configPath]) {
                    await run.copy(run.config[configPath], join(run.output, '.yfm'));
                }
            });
    }
}
