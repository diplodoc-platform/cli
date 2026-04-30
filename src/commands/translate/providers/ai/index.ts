import type {BaseProgram} from '~/core/program';
import type {Translate, TranslateArgs, TranslateConfig} from '~/commands/translate';
import type {LLMClient} from './clients/types';

import {ok} from 'assert';
import {join} from 'node:path';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks} from '~/commands/translate';
import {defined, resolveConfig} from '~/core/config';
import {own} from '~/core/utils';

import {Provider} from './provider';
import {options} from './config';
import {resolveToken} from './auth';
import {resolvePromptValue} from './prompts';
import {YandexGptClient} from './clients/yandexgpt';
import {AnthropicClient} from './clients/anthropic';
import {createOpenAIClient, createOpenRouterClient} from './clients/openai';

import type {GlossaryPair, PromptMode} from './prompts';

const PROVIDER_NAMES = ['yandexgpt', 'openai', 'openrouter', 'anthropic'] as const;
type ProviderName = (typeof PROVIDER_NAMES)[number];

const ExtensionName = 'AITranslation';

const DEFAULT_MODELS: Record<ProviderName, string> = {
    yandexgpt: 'yandexgpt-lite',
    openai: 'gpt-4o-mini',
    openrouter: 'openai/gpt-4o-mini',
    anthropic: 'claude-sonnet-4-5',
};

const ENV_VARS: Record<ProviderName, string[]> = {
    yandexgpt: ['YANDEX_API_KEY', 'YC_IAM_TOKEN'],
    openai: ['OPENAI_API_KEY'],
    openrouter: ['OPENROUTER_API_KEY'],
    anthropic: ['ANTHROPIC_API_KEY'],
};

type Args = {
    auth?: string;
    folder?: string;
    model?: string;
    apiBase?: string;
    systemPrompt?: string;
    userPrompt?: string;
    promptMode?: PromptMode;
    glossary?: string;
    temperature?: number;
    maxOutputTokens?: number;
    maxBatchTokens?: number;
    maxConcurrency?: number;
    retry?: number;
};

type Config = {
    auth: string;
    folder?: string;
    model: string;
    apiBase?: string;
    systemPrompt?: string;
    userPrompt?: string;
    promptMode: PromptMode;
    glossary?: string;
    glossaryPairs: GlossaryPair[];
    temperature: number;
    maxOutputTokens: number;
    maxBatchTokens: number;
    maxConcurrency: number;
    retry: number;
};

export type AITranslationConfig = TranslateConfig & Config;

function readEnvAuth(provider: ProviderName): string | undefined {
    for (const name of ENV_VARS[provider]) {
        const value = process.env[name];
        if (value) {
            return value;
        }
    }
    return undefined;
}

function makeClientFactory(provider: ProviderName) {
    return function clientFactory(config: AITranslationConfig): LLMClient {
        switch (provider) {
            case 'yandexgpt':
                ok(config.folder, 'Yandex AI Studio: --folder is required');
                return new YandexGptClient({
                    token: config.auth,
                    folder: config.folder,
                    model: config.model,
                    endpoint: config.apiBase,
                });
            case 'openai':
                return createOpenAIClient({
                    token: config.auth,
                    model: config.model,
                    baseUrl: config.apiBase,
                });
            case 'openrouter':
                return createOpenRouterClient({
                    token: config.auth,
                    model: config.model,
                    baseUrl: config.apiBase,
                });
            case 'anthropic':
                return new AnthropicClient({
                    token: config.auth,
                    model: config.model,
                    baseUrl: config.apiBase,
                });
        }
    };
}

function numberOr(value: unknown, fallback: number): number {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function intOr(value: unknown, fallback: number): number {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }
    const n = parseInt(String(value), 10);
    return Number.isFinite(n) ? n : fallback;
}

export class Extension {
    apply(program: Translate) {
        getBaseHooks(program).Command.tap(ExtensionName, (_command, opts) => {
            const providerOption = opts.find((option) => option.flags.match('--provider'));
            ok(providerOption, 'Unable to configure `--provider` option.');

            const choices = providerOption.argChoices || [];
            for (const name of PROVIDER_NAMES) {
                if (!choices.includes(name)) {
                    choices.push(name);
                }
            }
            providerOption.choices(choices);
        });

        for (const providerName of PROVIDER_NAMES) {
            this.registerProvider(program, providerName);
        }
    }

    private registerProvider(program: Translate, providerName: ProviderName) {
        getHooks(program)
            .Provider.for(providerName)
            .tap(`${ExtensionName}.${providerName}`, (_provider, _config) => {
                getBaseHooks(program).Command.tap(
                    `${ExtensionName}.${providerName}`,
                    (command) => {
                        command
                            .addOption(options.auth)
                            .addOption(options.model)
                            .addOption(options.apiBase)
                            .addOption(options.systemPrompt)
                            .addOption(options.userPrompt)
                            .addOption(options.promptMode)
                            .addOption(options.glossary)
                            .addOption(options.temperature)
                            .addOption(options.maxOutputTokens)
                            .addOption(options.maxBatchTokens)
                            .addOption(options.maxConcurrency)
                            .addOption(options.retry);

                        if (providerName === 'yandexgpt') {
                            command.addOption(options.folder);
                        }
                    },
                );

                getBaseHooks(
                    program as BaseProgram<
                        TranslateConfig & Partial<Config>,
                        TranslateArgs & Partial<Args>
                    >,
                ).Config.tapPromise(
                    `${ExtensionName}.${providerName}`,
                    async (config, args) => {
                        ok(!config.auth, 'Do not store `authToken` in public config');

                        const rawAuth = args.auth || readEnvAuth(providerName);
                        ok(
                            rawAuth,
                            `Required param --auth is not configured for provider "${providerName}"`,
                        );
                        config.auth = resolveToken(rawAuth);

                        const model =
                            (defined('model', args, config) as string | undefined) ||
                            DEFAULT_MODELS[providerName];
                        config.model = model;

                        const apiBase = defined('apiBase', args, config);
                        if (apiBase) {
                            config.apiBase = apiBase;
                        }

                        if (providerName === 'yandexgpt') {
                            config.folder = defined('folder', args, config);
                            if (!config.folder && !model.startsWith('gpt://')) {
                                ok(
                                    false,
                                    'Yandex AI Studio: --folder is required when --model is a short name',
                                );
                            }
                        }

                        config.systemPrompt = resolvePromptValue(
                            defined('systemPrompt', args, config) || undefined,
                        );
                        config.userPrompt = resolvePromptValue(
                            defined('userPrompt', args, config) || undefined,
                        );
                        config.promptMode =
                            (defined('promptMode', args, config) as PromptMode) || 'append';

                        config.temperature = numberOr(defined('temperature', args, config), 0);
                        config.maxOutputTokens = intOr(
                            defined('maxOutputTokens', args, config),
                            4000,
                        );
                        config.maxBatchTokens = intOr(
                            defined('maxBatchTokens', args, config),
                            2000,
                        );
                        config.maxConcurrency = intOr(
                            defined('maxConcurrency', args, config),
                            5,
                        );
                        config.retry = intOr(defined('retry', args, config), 3);

                        let glossary: AbsolutePath | undefined;
                        if (own<string, 'glossary'>(args, 'glossary')) {
                            glossary = join(args.input, args.glossary);
                        } else if (own<string, 'glossary'>(config, 'glossary')) {
                            glossary = config.resolve(config.glossary);
                        }

                        if (glossary) {
                            const glossaryConfig = await resolveConfig(glossary, {
                                defaults: {glossaryPairs: []},
                            });
                            config.glossaryPairs = glossaryConfig.glossaryPairs || [];
                        } else {
                            config.glossaryPairs = [];
                        }

                        return config;
                    },
                );

                const provider = new Provider(makeClientFactory(providerName), _config);

                provider.pipe(program.logger);

                return provider;
            });
    }
}
