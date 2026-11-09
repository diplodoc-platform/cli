import type {MetadataArgs, MetadataConfig, MetadataSettings} from './types';

import {ok} from 'node:assert';
import {bold} from 'chalk';

import {Command} from '~/core/config';
import {BaseProgram, getHooks, withConfigDefaults, withConfigScope} from '~/core/program';
import {console} from '~/core/utils';
import {parseHeaders} from '~/commands/translate/providers/ai/clients';

import {MODES, PROVIDERS, options, resolveFields} from './config';
import {runWizard} from './wizard';
import {generateMetadata} from './generator';

@withConfigScope('generate.metadata', {strict: true})
@withConfigDefaults(() => ({mode: 'missing', provider: 'yandexgpt', skipInteractive: false}))
export class Metadata extends BaseProgram<MetadataConfig, MetadataArgs> {
    readonly name = 'Generate.Metadata';

    readonly command = new Command('metadata').description(
        'Generate documentation metadata using AI',
    );

    readonly options = Object.values(options);

    apply(program?: BaseProgram) {
        super.apply(program);

        getHooks(this).RawConfig.tap(this.name, (config) => {
            ok(
                !config.auth,
                'Do not store auth tokens in public config. Use --auth or an environment variable.',
            );
        });

        getHooks(this).Config.tap(this.name, (config, args) => {
            config.fields = resolveFields(args.fields ?? config.fields);
            config.apiHeaders = parseHeaders(args.apiHeader ?? config.apiHeaders);

            return config;
        });
    }

    async action() {
        const {input, mode = 'missing', provider = 'yandexgpt', model} = this.config;

        ok(MODES.includes(mode), `Unknown metadata mode: ${mode}`);
        ok(PROVIDERS.includes(provider), `Unknown metadata provider: ${provider}`);
        ok(model === undefined || typeof model === 'string', 'Model must be a string.');

        for (const key of ['retry', 'rateLimitRetry', 'maxOutputTokens', 'timeout'] as const) {
            const value = this.config[key];

            if (value !== undefined) {
                const minimum = key === 'retry' || key === 'rateLimitRetry' ? 0 : 1;
                ok(
                    Number.isInteger(value) && value >= minimum,
                    `${key} must be an integer >= ${minimum}.`,
                );
            }
        }

        let settings: MetadataSettings = {
            input,
            fields: resolveFields(this.config.fields),
            mode,
            provider,
            model,
        };

        if (process.stdin.isTTY && !this.config.skipInteractive) {
            settings = await runWizard(settings);
        }

        console.log(bold('\nMetadata generation settings'));
        console.log(`Input: ${settings.input}`);
        console.log(`Fields: ${settings.fields.join(', ')}`);
        console.log(`Mode: ${settings.mode}`);
        console.log(`Provider: ${settings.provider}`);
        console.log(`Model: ${settings.model || '(provider default)'}`);
        await generateMetadata(settings, this.config);
    }
}
