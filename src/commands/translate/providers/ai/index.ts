import type {BaseProgram} from '~/core/program';
import type {Config as ResolvedConfig} from '~/core/config';
import type {Translate, TranslateArgs, TranslateConfig} from '~/commands/translate';
import type {CodeMode} from '~/commands/translate/utils';
import type {LLMClient} from './clients/types';
import type {GlossaryPair, PromptMode} from './prompts';

import {ok} from 'node:assert';
import {join, resolve} from 'node:path';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks} from '~/commands/translate';
import {defined, resolveConfig} from '~/core/config';
import {own} from '~/core/utils';

import {Provider} from './provider';
import {NO_TEMPERATURE, options} from './config';
import {resolveToken} from './auth';
import {resolveContextValue, resolvePromptValue} from './prompts';
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

// The header each client would build from --auth. When the same header
// comes from --api-header / apiHeaders (internal gateways with their own
// auth schemes), --auth becomes redundant and is not required.
const AUTH_HEADER: Record<ProviderName, string> = {
    yandexgpt: 'authorization',
    openai: 'authorization',
    openrouter: 'authorization',
    anthropic: 'x-api-key',
};

type Args = {
    auth?: string;
    folder?: string;
    model?: string;
    fallbackModel?: string;
    apiBase?: string;
    fallbackApiBase?: string;
    apiHeader?: string[];
    systemPrompt?: string;
    userPrompt?: string;
    promptMode?: PromptMode;
    contextFile?: string[];
    glossary?: string;
    judge?: boolean;
    judgeModel?: string;
    judgeThreshold?: number;
    cacheDir?: string;
    cache?: boolean;
    memoryHints?: boolean;
    temperature?: number;
    maxOutputTokens?: number;
    maxBatchTokens?: number;
    maxConcurrency?: number;
    retry?: number;
    rateLimitRetry?: number;
};

type Config = {
    auth?: string;
    folder?: string;
    model: string;
    code: CodeMode;
    fallbackModel?: string;
    apiBase?: string;
    fallbackApiBase?: string;
    apiHeaders: Record<string, string>;
    systemPrompt?: string;
    userPrompt?: string;
    promptMode: PromptMode;
    contextFiles: string[];
    glossary?: string;
    glossaryPairs: GlossaryPair[];
    judge: boolean;
    judgeModel?: string;
    judgeThreshold: number;
    cacheDir?: AbsolutePath;
    /** Send changed units with their previous version from the seed memory. */
    memoryHints: boolean;
    temperature?: number;
    maxOutputTokens: number;
    maxBatchTokens: number;
    maxConcurrency: number;
    retry: number;
    rateLimitRetry: number;
};

export type AITranslationConfig = TranslateConfig & Config;

/**
 * A negatable flag always carries its default in args, so the config key
 * is consulted unless `--no-memory-hints` was given.
 */
function resolveMemoryHints(args: Args, config: Hash): boolean {
    if (args.memoryHints === false) {
        return false;
    }
    return !own<boolean, 'memoryHints'>(config, 'memoryHints') || config.memoryHints !== false;
}

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
            const text = String(entry);
            const separator = text.indexOf(':');
            ok(separator > 0, `Invalid api header "${entry}". Expected "Name: value" format.`);
            headers[text.slice(0, separator).trim()] = text.slice(separator + 1).trim();
        }
        return headers;
    }

    if (typeof value === 'object') {
        return {...(value as Record<string, string>)};
    }

    return parseHeaders([value]);
}

/**
 * Resolves --context-file values: CLI paths from cwd, config values from the config dir.
 */
function resolveContextFiles(
    args: TranslateArgs & Partial<Args>,
    config: ResolvedConfig<TranslateConfig & Partial<Config>>,
): string[] {
    if (own<string[], 'contextFile'>(args, 'contextFile')) {
        return args.contextFile.map((value) => resolveContextValue(value));
    }

    if (own<string[] | string, 'contextFiles'>(config, 'contextFiles')) {
        return ([] as string[])
            .concat(config.contextFiles)
            .map((value) => resolveContextValue(value, config.resolve));
    }

    return [];
}

/**
 * A fallback endpoint without a fallback model configures nothing, so it is
 * rejected instead of being silently ignored.
 */
function resolveFallbackApiBase(value: unknown, fallbackModel: string | undefined) {
    const fallbackApiBase = (value as string | undefined) || undefined;

    ok(!fallbackApiBase || fallbackModel, '--fallback-api-base requires --fallback-model');

    return fallbackApiBase;
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

/**
 * `none` keeps the parameter out of the request and leaves the choice to the
 * model; anything else falls back to the deterministic default.
 */
function resolveTemperature(value: unknown): number | undefined {
    return value === NO_TEMPERATURE ? undefined : numberOr(value, 0);
}

function numberOr(value: unknown, fallback: number): number {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function intOr(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value);
    }
    if (typeof value === 'string' && value !== '') {
        const n = Number.parseInt(value, 10);
        return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
}

export class Extension {
    apply(program: Translate) {
        getBaseHooks(program).Command.tap(ExtensionName, (_command, opts) => {
            const providerOption = opts.find((option) => option.flags.includes('--provider'));
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
                        .addOption(options.fallbackModel)
                        .addOption(options.apiBase)
                        .addOption(options.fallbackApiBase)
                        .addOption(options.apiHeader)
                        .addOption(options.systemPrompt)
                        .addOption(options.userPrompt)
                        .addOption(options.promptMode)
                        .addOption(options.contextFile)
                        .addOption(options.glossary)
                        .addOption(options.judge)
                        .addOption(options.judgeModel)
                        .addOption(options.judgeThreshold)
                        .addOption(options.cacheDir)
                        .addOption(options.noCache)
                        .addOption(options.noMemoryHints)
                        .addOption(options.temperature)
                        .addOption(options.maxOutputTokens)
                        .addOption(options.maxBatchTokens)
                        .addOption(options.maxConcurrency)
                        .addOption(options.retry)
                        .addOption(options.rateLimitRetry);

                    if (providerName === 'yandexgpt') {
                        command.addOption(options.folder);
                    }
                });

                // LLMs handle comments and diagram labels well, so the adaptive
                // code mode is the default for every LLM provider.
                getBaseHooks(program).Config.tap(`${ExtensionName}.${providerName}`, (config) => {
                    config.code = config.code ?? 'adaptive';

                    return config;
                });

                getBaseHooks(
                    program as BaseProgram<
                        TranslateConfig & Partial<Config>,
                        TranslateArgs & Partial<Args>
                    >,
                ).Config.tapPromise(`${ExtensionName}.${providerName}`, async (config, args) => {
                    ok(!config.auth, 'Do not store `authToken` in public config');

                    config.apiHeaders = parseHeaders(
                        own<string[], 'apiHeader'>(args, 'apiHeader')
                            ? args.apiHeader
                            : defined('apiHeaders', config),
                    );

                    const rawAuth = args.auth || readEnv(ENV_AUTH[providerName]);
                    const hasAuthHeader = Object.keys(config.apiHeaders).some(
                        (header) => header.toLowerCase() === AUTH_HEADER[providerName],
                    );
                    ok(
                        rawAuth || hasAuthHeader,
                        `Required param --auth is not configured for provider "${providerName}"`,
                    );
                    config.auth = rawAuth ? resolveToken(rawAuth) : undefined;

                    const model =
                        (defined('model', args, config) as string | undefined) ||
                        DEFAULT_MODELS[providerName];
                    config.model = model;

                    config.fallbackModel =
                        (defined('fallbackModel', args, config) as string | undefined) || undefined;

                    const apiBase =
                        defined('apiBase', args, config) || readEnv(ENV_BASE_URL[providerName]);
                    if (apiBase) {
                        config.apiBase = apiBase;
                    }

                    config.fallbackApiBase = resolveFallbackApiBase(
                        defined('fallbackApiBase', args, config),
                        config.fallbackModel,
                    );

                    if (providerName === 'yandexgpt') {
                        config.folder = defined('folder', args, config);

                        const qualified = (value: string) =>
                            value.startsWith('gpt://') || value.startsWith('ds://');
                        const models = [model, config.fallbackModel].filter(Boolean) as string[];
                        ok(
                            config.folder || models.every(qualified),
                            'Yandex AI Studio: --folder is required when --model or --fallback-model is a short name',
                        );
                    }

                    // CLI prompt paths are resolved from cwd, config values from the config dir.
                    const resolvePrompt = (key: 'systemPrompt' | 'userPrompt') => {
                        if (own<string, typeof key>(args, key)) {
                            return resolvePromptValue(args[key]);
                        }
                        if (own<string, typeof key>(config, key)) {
                            return resolvePromptValue(config[key], config.resolve);
                        }
                        return undefined;
                    };

                    config.systemPrompt = resolvePrompt('systemPrompt');
                    config.userPrompt = resolvePrompt('userPrompt');

                    config.contextFiles = resolveContextFiles(args, config);

                    config.promptMode =
                        (defined('promptMode', args, config) as PromptMode) || 'append';

                    config.judge = Boolean(defined('judge', args, config));
                    config.judgeModel =
                        (defined('judgeModel', args, config) as string | undefined) || undefined;
                    config.judgeThreshold = intOr(defined('judgeThreshold', args, config), 70);
                    config.memoryHints = resolveMemoryHints(args, config);

                    config.temperature = resolveTemperature(defined('temperature', args, config));
                    config.maxOutputTokens = intOr(defined('maxOutputTokens', args, config), 4000);
                    config.maxBatchTokens = intOr(defined('maxBatchTokens', args, config), 2000);
                    config.maxConcurrency = Math.max(
                        1,
                        intOr(defined('maxConcurrency', args, config), 5),
                    );
                    config.retry = intOr(defined('retry', args, config), 3);
                    config.rateLimitRetry = Math.max(
                        0,
                        intOr(defined('rateLimitRetry', args, config), 8),
                    );
                    config.timeout = intOr(defined('timeout', args, config), DEFAULT_TIMEOUT);

                    let cacheDir: AbsolutePath | undefined;
                    if (args.cache !== false) {
                        if (own<string, 'cacheDir'>(args, 'cacheDir')) {
                            cacheDir = resolve(args.cacheDir) as AbsolutePath;
                        } else if (own<string, 'cacheDir'>(config, 'cacheDir')) {
                            cacheDir = config.resolve(config.cacheDir);
                        }
                    }
                    config.cacheDir = cacheDir;

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
