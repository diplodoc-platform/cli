# Translate: fallback model on another endpoint — design

**Date:** 2026-09-11
**Status:** approved for implementation
**Package:** `@diplodoc/cli`

## Goal

Let `--fallback-model` point at a model served by a different endpoint than the
primary one, by adding `--fallback-api-base`.

## Problem

The fallback client is built from the primary config with the model name swapped:

```ts
const fallbackClient = config.fallbackModel
  ? this.clientFactory({...config, model: config.fallbackModel})
  : undefined;
```

So the reserve inherits `apiBase`. That is fine when the endpoint serves many
models and picks one by the request body, but it makes a whole class of reserves
unreachable: gateways that route by URL path.

The concrete case is the Yandex Eliza gateway. External vendors are exposed as
OpenAI-compatible endpoints whose path carries the vendor, while the model name
travels in the body:

- `https://api.eliza.yandex.net/raw/anthropic/v1` — Claude models,
- `https://api.eliza.yandex.net/raw/openai/v1` — GPT models.

A model of another vendor on such a path is rejected:

```
{"error": "model \"gpt-5-mini\" is not available for vendor \"anthropic\""}
```

The reserve therefore has to live at the same vendor as the primary model. For a
documentation pipeline that is exactly the reserve you do not want: when one
vendor is rate-limited or down, the useful fallback is a different vendor.

## Non-goals

- Separate credentials or headers for the reserve (`--fallback-auth`,
  `--fallback-api-header`). One gateway, one token covers the motivating case.
  The design keeps the extension point in one function for when it is needed.
- A second provider for the reserve (`--fallback-provider`). That means a second
  client class and protocol (for example `anthropic` native with `x-api-key`
  instead of an OpenAI-compatible body), which is a different feature.
- Extending the `--report` schema. The report already records `fallbackModel`;
  the endpoint adds nothing to run analysis and the schema is a versioned
  contract (`docs/translate-run-report.md`).

## Design

### Option surface

`--fallback-api-base <url>`, with the `fallbackApiBase` key available in the yfm
config, resolved through the usual `defined('fallbackApiBase', args, config)`.

No env fallback. `--api-base` has one (`OPENAI_BASE_URL` and friends) because
those variables are an SDK convention; no such convention exists for a reserve
endpoint.

The option description states the remaining limitation explicitly: the reserve
keeps the primary provider, credentials and headers. That belongs in `--help`,
not only in the sources.

### Resolution

One exported helper owns the rule "what config does the fallback client get":

```ts
export function fallbackClientConfig(config: AITranslationConfig): AITranslationConfig;
```

It lives in `src/commands/translate/providers/ai/utils/`, not in `index.ts`:
`provider.ts` currently imports only a _type_ from `index.ts`, and importing a
value would create a runtime cycle. `provider.ts` calls the helper instead of
spreading the config inline.

The helper returns the primary config with `model` replaced by `fallbackModel`
and `apiBase` replaced by `fallbackApiBase` when it is set. Everything else is
inherited. When `fallbackApiBase` is empty the result is what the code produces
today, so existing configs are unaffected.

### Validation

`--fallback-api-base` without `--fallback-model` fails config resolution with
`ok(...)`, next to the existing assert about `--folder` for yandexgpt. Silently
ignoring an option that was explicitly passed is worse than failing: the operator
would believe a reserve is configured.

## Testing

- `fallbackClientConfig`: inherits `apiBase` by default; overrides it when
  `fallbackApiBase` is set; leaves the rest of the config untouched.
- Config resolution: the flag and the yfm config key both land in
  `config.fallbackApiBase`; absent input leaves it `undefined`; the flag without
  `--fallback-model` throws.
- Provider: with a fallback endpoint configured, the client factory is called for
  the reserve with the overridden `apiBase`, following the existing fallback test
  in `provider.spec.ts`.

## Usage

```bash
yfm translate -i docs -o out --source ru --target en \
  --provider openai \
  --api-base https://api.eliza.yandex.net/raw/anthropic/v1 \
  --model claude-sonnet-4-5 \
  --fallback-api-base https://api.eliza.yandex.net/raw/openai/v1 \
  --fallback-model gpt-5 \
  --auth ./token
```
