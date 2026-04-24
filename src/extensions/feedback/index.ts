import type {BaseArgs, BaseConfig, BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {Args, Config} from './config';

import {join, resolve} from 'node:path';

import {Build, getBuildHooks, getEntryHooks} from '@diplodoc/cli';
import {getHooks as getBaseHooks} from '@diplodoc/cli/lib/program';

import {NAME, options, resolveTextFeedback, validateConfig} from './config';

const BUNDLE_FILENAME = 'feedback.js';
const BUNDLE_OUTPUT_PATH = join('_extensions', 'feedback', BUNDLE_FILENAME);

export class Extension implements IExtension {
    apply(program: BaseProgram<BaseConfig & Config, BaseArgs & Args>) {
        if (!Build.is(program)) {
            return;
        }

        getBaseHooks(program).Command.tap(NAME, (command) => {
            command.addOption(options.textFeedback);
        });

        getBaseHooks(program).Config.tap(NAME, (config, args) => {
            // CLI flag (string) takes priority over .yfm value
            if (args.textFeedback) {
                config.textFeedback = args.textFeedback;
            }

            validateConfig(config.textFeedback);

            return config;
        });

        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap(NAME, (run) => {
                const resolved = resolveTextFeedback(program.config.textFeedback);
                if (!resolved) return;

                const endpointOrigin = getOrigin(resolved.endpoint);

                getEntryHooks(run.entry).Page.tap(NAME, (template) => {
                    if (endpointOrigin) {
                        template.addCsp({'connect-src': [endpointOrigin]});
                    }

                    template.addScript(BUNDLE_OUTPUT_PATH, {
                        position: 'leading',
                        attrs: {defer: undefined},
                    });

                    template.addScript(
                        `window.feedbackExtensionInit(${JSON.stringify({
                            customFormEndpoint: resolved.endpoint,
                            metrika: resolved.metrika,
                        })})`,
                        {position: 'state', inline: true},
                    );
                });
            });

        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise(NAME, async (run) => {
                if (!resolveTextFeedback(program.config.textFeedback)) return;

                const bundleSrc = resolve(
                    __dirname,
                    'extensions',
                    'feedback',
                    'resources',
                    BUNDLE_FILENAME,
                );

                try {
                    await run.copy(bundleSrc, join(run.output, BUNDLE_OUTPUT_PATH));
                } catch (error) {
                    run.logger.warn(
                        `[TextFeedback] Unable to copy browser bundle from ${bundleSrc}.`,
                        error,
                    );
                }
            });
    }
}

function getOrigin(url: string): string | null {
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}
