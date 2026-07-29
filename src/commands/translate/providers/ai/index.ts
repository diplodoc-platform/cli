import type {BaseProgram} from '~/core/program';
import type {Translate, TranslateArgs, TranslateConfig} from '~/commands/translate';
import type {LLMClient} from './clients/types';
import type {GlossaryPair, PromptMode} from './prompts';

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

const PROVIDER_NAMES = ['yandexgpt', 'openai', 'openrouter', 'anthropic'] as const;
type ProviderName = (typeof PROVIDER_NAMES)[number];

const ExtensionName = 'AITranslation';

const DEFAULT_TIMEOUT = 60_000;

const DEFAULT_MODELS: Record<ProviderName, string> = {
    yandexgpt: 'yandexgpt-lite',
    openai: 'gpt-4o-mini',
    openrouter: 'openai/gpt-4o-mini',
    anthropic: 'claude-sonnet-4-5',
};

const ENV_AUTH: Record<ProviderName, string[]> = {
    yandexgpt: ['YANDEX_API_KEY', 'YC_IAM_TOKEN'],
    openai: ['OPENAI_API_KEY'],
    openrouter: ['OPENROUTER_API_KEY'],
    anthropic: ['ANTHROPIC_API_KEY'],
};

const ENV_BASE_URL: Record<ProviderName, string[]> = {
    yandexgpt: [],
    openai: ['OPENAI_BASE_URL'],
    openrouter: ['OPENROUTER_BASE_URL'],
    anthropic: ['ANTHROPIC_BASE_URL'],
};

type Args = {
    auth?: string;
    folder?: string;
    model?: string;
    apiBase?: string;
    apiHeader?: string[];
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
    apiHeaders: Record<string, string>;
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

function readEnv(names: string[]): string | undefined {
    for (const name of names) {
        const value = process.env[name];
        if (value) {
            return value;
        }
    }
    return undefined;
}

/**
 * Accepts headers as a list of "Name: value" strings (CLI) or as a plain object (config).
 */
function parseHeaders(value: unknown): Record<string, string> {
    if (!value) {
        return {};
    }

    if (Array.isArray(value)) {
        const headers: Record<string, string> = {};
        for (const entry of value) {
            const match = String(entry).match(/^([^:]+):\s*(.*)$/);
            ok(match, `Invalid api header "${entry}". Expected "Name: value" format.`);
            headers[match[1].trim()] = match[2];
        }
        return headers;
    }

    if (typeof value === 'object') {
        return {...(value as Record<string, string>)};
    }

    return parseHeaders([value]);
}

function makeClientFactory(provider: ProviderName) {
    return function clientFactory(config: AITranslationConfig): LLMClient {
        const common = {
            token: config.auth,
            model: config.model,
            baseUrl: config.apiBase,
            timeout: config.timeout,
            headers: config.apiHeaders,
        };

        switch (provider) {
            case 'yandexgpt':
                return new YandexGptClient({...common, folder: config.folder});
            case 'openai':
                return createOpenAIClient(common);
            case 'openrouter':
                return createOpenRouterClient(common);
            case 'anthropic':
                return new AnthropicClient(common);
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
            .tap(`${ExtensionName}.${providerName}`, (_provider, config) => {
                getBaseHooks(program).Command.tap(`${ExtensionName}.${providerName}`, (command) => {
                    command
                        .addOption(options.auth)
                        .addOption(options.model)
                        .addOption(options.apiBase)
                        .addOption(options.apiHeader)
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
                });

                getBaseHooks(
                    program as BaseProgram<
                        TranslateConfig & Partial<Config>,
                        TranslateArgs & Partial<Args>
                    >,
                ).Config.tapPromise(`${ExtensionName}.${providerName}`, async (config, args) => {
                    ok(!config.auth, 'Do not store `authToken` in public config');

                    const rawAuth = args.auth || readEnv(ENV_AUTH[providerName]);
                    ok(
                        rawAuth,
                        `Required param --auth is not configured for provider "${providerName}"`,
                    );
                    config.auth = resolveToken(rawAuth);

                    const model =
                        (defined('model', args, config) as string | undefined) ||
                        DEFAULT_MODELS[providerName];
                    config.model = model;

                    const apiBase =
                        defined('apiBase', args, config) || readEnv(ENV_BASE_URL[providerName]);
                    if (apiBase) {
                        config.apiBase = apiBase;
                    }

                    config.apiHeaders = parseHeaders(
                        own<string[], 'apiHeader'>(args, 'apiHeader')
                            ? args.apiHeader
                            : defined('apiHeaders', config),
                    );

                    if (providerName === 'yandexgpt') {
                        config.folder = defined('folder', args, config);

                        const qualified = model.startsWith('gpt://') || model.startsWith('ds://');
                        ok(
                            config.folder || qualified,
                            'Yandex AI Studio: --folder is required when --model is a short name',
                        );
                    }

                    // CLI prompt paths are resolved from cwd, config values from the config dir.
                    const systemPrompt = own<string, 'systemPrompt'>(args, 'systemPrompt')
                        ? resolvePromptValue(args.systemPrompt)
                        : resolvePromptValue(
                              own<string, 'systemPrompt'>(config, 'systemPrompt')
                                  ? config.systemPrompt
                                  : undefined,
                              config.resolve,
                          );
                    const userPrompt = own<string, 'userPrompt'>(args, 'userPrompt')
                        ? resolvePromptValue(args.userPrompt)
                        : resolvePromptValue(
                              own<string, 'userPrompt'>(config, 'userPrompt')
                                  ? config.userPrompt
                                  : undefined,
                              config.resolve,
                          );

                    config.systemPrompt = systemPrompt;
                    config.userPrompt = userPrompt;

                    config.promptMode =
                        (defined('promptMode', args, config) as PromptMode) || 'append';

                    config.temperature = numberOr(defined('temperature', args, config), 0);
                    config.maxOutputTokens = intOr(defined('maxOutputTokens', args, config), 4000);
                    config.maxBatchTokens = intOr(defined('maxBatchTokens', args, config), 2000);
                    config.maxConcurrency = Math.max(
                        1,
                        intOr(defined('maxConcurrency', args, config), 5),
                    );
                    config.retry = intOr(defined('retry', args, config), 3);
                    config.timeout = intOr(defined('timeout', args, config), DEFAULT_TIMEOUT);

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
                });

                const provider = new Provider(makeClientFactory(providerName), config);

                provider.pipe(program.logger);

                return provider;
            });
    }
}
