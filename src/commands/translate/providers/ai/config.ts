import {cyan, gray} from 'chalk';
import {dedent} from 'ts-dedent';

import {option} from '~/core/config';

const auth = option({
    flags: '--auth <value>',
    desc: `
        Authorization token for the AI provider.
        Accepts the raw token value or a path to a file containing the token.

        Yandex AI Studio: IAM token (Bearer) or service-account API key.
        OpenAI / OpenRouter: Bearer key (sk-...).
        Anthropic: x-api-key (sk-ant-...).
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
        Override the API base URL (useful for self-hosted or compatible endpoints).
    `,
});

const systemPrompt = option({
    flags: '--system-prompt <value>',
    desc: `
        System prompt for the LLM. Accepts a string or a path to a file.

        Supports placeholders: {{source}}, {{target}}, {{glossary}}, {{separator}}, {{fragments}}.

        By default the user prompt is appended to the built-in technical-translator system prompt.
        Use --prompt-mode replace to fully replace the default.
    `,
});

const userPrompt = option({
    flags: '--user-prompt <value>',
    desc: `
        User prompt template. Accepts a string or a path to a file.
        Supports placeholders: {{source}}, {{target}}, {{glossary}}, {{separator}}, {{fragments}}, {{text}}.
    `,
});

const promptMode = option({
    flags: '--prompt-mode <mode>',
    desc: `
        How the user-supplied system prompt interacts with the default one.

        ${cyan('append')} (default) — supplied system prompt is appended to the built-in default.
        ${cyan('replace')} — supplied system prompt fully replaces the built-in default.
    `,
    choices: ['append', 'replace'],
    default: 'append',
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
    parser: (value: string) => Number(value),
    default: 0,
});

const maxOutputTokens = option({
    flags: '--max-output-tokens <num>',
    desc: 'Maximum tokens in a single LLM response. Default 4000.',
    parser: (value: string) => parseInt(value, 10),
    default: 4000,
});

const maxBatchTokens = option({
    flags: '--max-batch-tokens <num>',
    desc: `
        Token budget for a single LLM request. Translation units are batched up to this
        limit and sent together. Smaller values are safer but slower. Default 2000.
    `,
    parser: (value: string) => parseInt(value, 10),
    default: 2000,
});

const maxConcurrency = option({
    flags: '--max-concurrency <num>',
    desc: 'Maximum concurrent LLM requests. Default 5.',
    parser: (value: string) => parseInt(value, 10),
    default: 5,
});

const retry = option({
    flags: '--retry <num>',
    desc: 'Number of retries on retryable LLM errors. Default 3.',
    parser: (value: string) => parseInt(value, 10),
    default: 3,
});

export const options = {
    auth,
    folder,
    model,
    apiBase,
    systemPrompt,
    userPrompt,
    promptMode,
    glossary,
    temperature,
    maxOutputTokens,
    maxBatchTokens,
    maxConcurrency,
    retry,
};
