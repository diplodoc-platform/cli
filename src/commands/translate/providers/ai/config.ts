import {cyan, gray} from 'chalk';
import {dedent} from 'ts-dedent';

import {option, toArray} from '~/core/config';

const auth = option({
    flags: '--auth <value>',
    desc: `
        Authorization token for the AI provider.
        Accepts the raw token value or a path to a file containing the token.

        Yandex AI Studio: IAM token (Bearer) or service-account API key.
        OpenAI / OpenRouter: Bearer key (sk-...).
        Anthropic: x-api-key (sk-ant-...).

        Env fallback: YANDEX_API_KEY / YC_IAM_TOKEN, OPENAI_API_KEY, OPENROUTER_API_KEY, ANTHROPIC_API_KEY.
    `,
});

const folder = option({
    flags: '--folder <value>',
    desc: `
        Yandex AI Studio folder ID. Required when --model is a short model name
        (e.g. "yandexgpt-lite") so the full gpt:// URI can be built.
    `,
});

const model = option({
    flags: '--model <value>',
    desc: `
        Target model identifier.

        Yandex AI Studio: short name ("yandexgpt-lite", "yandexgpt") or full URI ("gpt://<folder>/yandexgpt/latest").
        OpenAI: e.g. "gpt-4o-mini".
        OpenRouter: e.g. "anthropic/claude-3.5-sonnet".
        Anthropic: e.g. "claude-sonnet-4-5".
    `,
});

const apiBase = option({
    flags: '--api-base <url>',
    desc: `
        Override the API base URL. Useful for self-hosted and internal
        installations of compatible APIs.

        The provider request path is appended automatically:
        yandexgpt: <base>/foundationModels/v1/completion
        openai / openrouter: <base>/chat/completions (include /v1 into the base)
        anthropic: <base>/messages (include /v1 into the base)

        Env fallback: OPENAI_BASE_URL, OPENROUTER_BASE_URL, ANTHROPIC_BASE_URL.
    `,
});

const apiHeader = option({
    flags: '--api-header <header>',
    desc: `
        Additional HTTP header for LLM API requests in "Name: value" format.
        Repeat the option to pass several headers.
        Useful for internal gateways which require extra auth headers.

        Config alternative: ${cyan('apiHeaders')} object in the yfm config.
    `,
    parser: toArray,
});

const systemPrompt = option({
    flags: '--system-prompt <value>',
    desc: `
        System prompt for the LLM. Accepts a string or a path to a file.

        Supports placeholders: {{source}}, {{target}}, {{glossary}}, {{context}}, {{separator}}, {{fragments}}.

        By default the user prompt is appended to the built-in technical-translator system prompt.
        Use --prompt-mode replace to fully replace the default.
    `,
});

const userPrompt = option({
    flags: '--user-prompt <value>',
    desc: `
        User prompt template. Accepts a string or a path to a file.
        Supports placeholders: {{source}}, {{target}}, {{glossary}}, {{context}}, {{separator}}, {{fragments}}, {{text}}.
    `,
});

const promptMode = option({
    flags: '--prompt-mode <mode>',
    desc: `
        How the user-supplied system prompt interacts with the default one.

        ${cyan('append')} - supplied system prompt is appended to the built-in default.
        ${cyan('replace')} - supplied system prompt fully replaces the built-in default.
    `,
    choices: ['append', 'replace'],
    defaultInfo: 'append',
});

const judge = option({
    flags: '--judge',
    desc: `
        Score translated units with a judge model after translation and
        write a quality report to the output directory. Opt-in: roughly
        doubles token usage. Segments below --judge-threshold are also
        reported as warnings.
    `,
});

const judgeModel = option({
    flags: '--judge-model <name>',
    desc: 'Model used for quality scoring. Defaults to the translation model.',
});

const judgeThreshold = option({
    flags: '--judge-threshold <num>',
    desc: 'Score below which a segment is reported as low quality.',
    parser: (value: string) => Number.parseInt(value, 10),
    defaultInfo: 70,
});

const glossaryExample = gray(dedent`
    glossaryPairs:
      - sourceText: string
        translatedText: string
`);

const glossary = option({
    flags: '--glossary <path>',
    desc: `
        Path to a YAML file with required term translations.

        Config example:
        ${glossaryExample}
    `,
});

const temperature = option({
    flags: '--temperature <num>',
    desc: 'Sampling temperature. Defaults to 0 for deterministic translation.',
    parser: Number,
    defaultInfo: 0,
});

const maxOutputTokens = option({
    flags: '--max-output-tokens <num>',
    desc: 'Maximum tokens in a single LLM response.',
    parser: (value: string) => Number.parseInt(value, 10),
    defaultInfo: 4000,
});

const maxBatchTokens = option({
    flags: '--max-batch-tokens <num>',
    desc: `
        Token budget for a single LLM request. Translation units are batched up to this
        limit and sent together. Smaller values are safer but slower.
    `,
    parser: (value: string) => Number.parseInt(value, 10),
    defaultInfo: 2000,
});

const maxConcurrency = option({
    flags: '--max-concurrency <num>',
    desc: 'Maximum concurrent LLM requests.',
    parser: (value: string) => Number.parseInt(value, 10),
    defaultInfo: 5,
});

const retry = option({
    flags: '--retry <num>',
    desc: 'Number of retries on retryable LLM errors.',
    parser: (value: string) => Number.parseInt(value, 10),
    defaultInfo: 3,
});

export const options = {
    auth,
    folder,
    model,
    apiBase,
    apiHeader,
    systemPrompt,
    userPrompt,
    promptMode,
    glossary,
    judge,
    judgeModel,
    judgeThreshold,
    temperature,
    maxOutputTokens,
    maxBatchTokens,
    maxConcurrency,
    retry,
};
