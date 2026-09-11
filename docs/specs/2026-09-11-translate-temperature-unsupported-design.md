# Translate: models which reject `temperature` — design

**Date:** 2026-09-11
**Status:** approved for implementation
**Package:** `@diplodoc/cli`

## Goal

Keep `yfm translate` working with models that refuse a non-default
`temperature`, without asking every consumer to discover and configure a
workaround.

## Problem

`temperature` defaults to `0` (deterministic translations) and every client puts
it into the request body unconditionally. The newest frontier models reject it:

| Model                                                        | Response to `temperature: 0`                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `claude-sonnet-5`, `claude-opus-5`, `claude-fable-5-1`       | `` `temperature` is deprecated for this model. ``                                                               |
| `gpt-5.6-sol`                                                | `Unsupported value: 'temperature' does not support 0 with this model. Only the default (1) value is supported.` |
| `claude-sonnet-4-6`, `claude-sonnet-4-5`, `claude-haiku-4-5` | works                                                                                                           |

Both vendors answer with HTTP 400, which is not retryable, so the whole file
fails. Every request fails the same way, so the run ends with zero translated
files.

The workaround — setting `temperature: 1` explicitly — requires knowing the
model's quirk in advance. Callers that wrap the CLI (CI cubes, pipelines) often
cannot pass a flag at all, which turns "connect a newer model" into a support
request.

## Non-goals

- Dropping the `temperature` default. Determinism at `0` is what the current
  behaviour buys for every model that still supports it.
- A per-model capability table. Vendors add and retire models faster than this
  CLI releases, and the API already reports the limitation precisely.
- Touching `yandexgpt`. Its models accept `temperature`; nothing to recover
  from.

## Design

### Recovery in the client

The client owns the request body, so it also owns the recovery. When a request
fails with HTTP 400 and the error names `temperature`, the client repeats the
same request once with the field removed and remembers the verdict for the rest
of the run, so only the first request pays for the discovery.

The check itself lives next to `throwLLMError` in `utils/errors.ts` as
`isTemperatureRejected(error)`: the knowledge of vendor error shapes is already
there. It matches on `error.param === 'temperature'` (OpenAI) or a message
mentioning temperature (Anthropic sends `param: null`).

Both `OpenAICompatibleClient` (covers `openai` and `openrouter`, and every
OpenAI-compatible gateway) and `AnthropicClient` get the behaviour.

### Visibility

Silently running at a different temperature than configured would be worse than
the failure it replaces. `LLMClient` gets an optional readonly
`temperatureDropped`, set by the client after the recovery, and the translator
emits one warning per target language:

```
WARN ru/index.md The model rejected temperature; requests continue without it.
```

An optional field keeps every existing client valid without changes.

### Opting out

`--temperature none` (and `temperature: none` in the yfm config) leaves the
parameter out of the request from the start, for callers who already know the
model refuses it or who deliberately want the model's own default. The
deterministic `0` stays the default: measured against `deepseek-v4-flash`
through the Eliza gateway, four requests at `temperature: 0` returned the same
text, while three requests without the parameter returned three different
translations of the same source ("cube" vs "bot", "changed" vs "modified").
Re-running a translation would rewrite wording that nobody edited, which is
noise in the resulting pull request.

## Testing

- Resolution: `--temperature none` and the config key leave `temperature`
  undefined; anything else keeps the numeric default.
- Clients leave the field out when `temperature` is undefined.
- `isTemperatureRejected`: true for the OpenAI shape (`param: 'temperature'`)
  and for the Anthropic shape (message mentions temperature, `param: null`);
  false for other 400s, for 429/500, and for non-Axios errors.
- `OpenAICompatibleClient` and `AnthropicClient`: a rejected request is repeated
  without the field and succeeds; the retried payload has no `temperature`; the
  next request omits it without another round trip; `temperatureDropped` is set.
- A 400 unrelated to temperature is not retried.
- Provider: the warning is emitted once when the client reports the drop.
