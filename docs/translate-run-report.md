# Translate run report

`yfm translate --report <path>` writes a machine-readable JSON report of the
translation run: timings, volume, cache and fallback usage, judge scores and
errors. The report is meant for automation around translation (CI pipelines,
usage analytics, dashboards).

The flag is disabled by default and translation behavior does not depend on
it. A short one-line run summary is always logged at the end of the run,
with or without the flag:

```
INFO PROCESSED run success in 12.4s; files: 12 translated, 0 failed; units: 340 (154 cached, 45.3% hit rate); chars: 15200 in / 16900 out; tokens: 5200 in / 4800 out; requests: 18 (2 fallback, 3 retries); errors: 0
```

## Usage

```sh
yfm translate -i ./docs -o ./translated \
    --provider openai --source ru --target en \
    --report ./translate-report.json
```

The CLI path is resolved from the current working directory. The option can
also be set in the `.yfm` config (`translate.report`), then the path is
resolved from the config directory.

## Schema versioning

The report shape is a public contract. The `schemaVersion` field is bumped on
any breaking change, so consumers must check it and reject versions they do
not understand instead of silently misreading the data.

The TypeScript types of the report are exported from the translate command
module: `TranslateRunReport`, `TranslateReportCounters`,
`TranslateReportTarget`, `TranslateReportJudge`, `TranslateReportError` and
the `TRANSLATE_REPORT_SCHEMA_VERSION` constant.

## Report structure

Top-level fields:

| Field             | Type     | Description                                                                                   |
| ----------------- | -------- | --------------------------------------------------------------------------------------------- |
| `schemaVersion`   | number   | Report schema version, currently `1`.                                                         |
| `startedAt`       | string   | ISO 8601 start time of the CLI process.                                                       |
| `finishedAt`      | string   | ISO 8601 finish time.                                                                         |
| `durationMs`      | number   | Run duration in milliseconds.                                                                 |
| `status`          | string   | `success`, `partial` (completed with recorded errors) or `failed` (aborted on a fatal error). |
| `provider`        | string   | Translation provider name (`openai`, `anthropic`, `yandexgpt`, `openrouter`, `yandex`).       |
| `model`           | string?  | Model identifier (LLM providers only).                                                        |
| `fallbackModel`   | string?  | The `--fallback-model` value when configured.                                                 |
| `fallbackUsed`    | boolean  | True when at least one request was served by the fallback model.                              |
| `dryRun`          | boolean  | True for `--dry-run`; volume and token numbers are estimates then.                            |
| `sourceLanguage`  | string   | Source language.                                                                              |
| `targetLanguages` | string[] | Target languages of the run.                                                                  |
| `files`           | object   | `selected` - files picked for translation, `skipped` - files filtered out before translation. |
| `totals`          | counters | Counters aggregated across all targets (see below).                                           |
| `targets`         | target[] | Per-target-language counters, plus `judge` stats when `--judge` is enabled.                   |
| `errors`          | error[]  | Every recorded error: `target?`, `path?`, stable `code`, `message`.                           |

Counters (`totals` and each entry of `targets`):

| Field                         | Type           | Description                                                                                                                          |
| ----------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `files.translated`            | number         | Files processed successfully.                                                                                                        |
| `files.failed`                | number         | Files that failed.                                                                                                                   |
| `files.retried`               | number         | Files re-queued for the final sweep after transient errors.                                                                          |
| `units.total`                 | number         | Translation units (segments) seen.                                                                                                   |
| `units.translated`            | number         | Units translated by the provider during this run.                                                                                    |
| `units.fromCache`             | number         | Units served from the persistent cache (including seeds).                                                                            |
| `units.untranslated`          | number         | Units the model returned untranslated.                                                                                               |
| `units.oversized`             | number         | Units skipped as too big for a single request.                                                                                       |
| `chars.source`                | number         | Source characters across all seen units.                                                                                             |
| `chars.translated`            | number         | Characters of translations produced during this run.                                                                                 |
| `chars.request`               | number         | Characters actually sent in requests.                                                                                                |
| `tokens`                      | object or null | `input`/`output` token usage as reported by the provider; `null` when the provider does not report usage. Estimated in dry-run mode. |
| `requests.total`              | number         | Translation requests sent.                                                                                                           |
| `requests.fallback`           | number         | Requests served by the fallback model.                                                                                               |
| `requests.retries`            | number         | Extra request attempts after retryable errors.                                                                                       |
| `cache.enabled`               | boolean        | Whether the persistent cache (`--cache-dir`) was active.                                                                             |
| `cache.hits` / `cache.misses` | number         | Cache lookups by outcome.                                                                                                            |
| `cache.hitRate`               | number or null | `hits / (hits + misses)`, `null` when the cache is disabled or was not consulted.                                                    |

Judge stats (`targets[].judge`, present when `--judge` is enabled):

| Field            | Type   | Description                                                   |
| ---------------- | ------ | ------------------------------------------------------------- |
| `model`          | string | Judge model.                                                  |
| `threshold`      | number | `--judge-threshold` value.                                    |
| `scored`         | number | Scored source/translation pairs.                              |
| `averageScore`   | number | Average score, 0-100.                                         |
| `belowThreshold` | number | Pairs scored below the threshold.                             |
| `unscored`       | number | Pairs the judge failed to score.                              |
| `distribution`   | object | Score histogram with stable keys `0-9` ... `90-99` and `100`. |

Provider coverage: LLM providers (`openai`, `anthropic`, `yandexgpt`,
`openrouter`) fill all counters. The `yandex` (Yandex Translate) provider has
no token usage, persistent cache or judge, so `tokens` is `null`,
`cache.enabled` is `false` and `judge` is absent.

## Example

```json
{
  "schemaVersion": 1,
  "startedAt": "2026-08-25T10:00:00.000Z",
  "finishedAt": "2026-08-25T10:00:12.400Z",
  "durationMs": 12400,
  "status": "success",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "fallbackModel": "gpt-4o",
  "fallbackUsed": true,
  "dryRun": false,
  "sourceLanguage": "ru",
  "targetLanguages": ["en"],
  "files": {"selected": 12, "skipped": 3},
  "totals": {
    "files": {"translated": 12, "failed": 0, "retried": 1},
    "units": {"total": 340, "translated": 182, "fromCache": 154, "untranslated": 4, "oversized": 0},
    "chars": {"source": 15200, "translated": 16900, "request": 8300},
    "tokens": {"input": 5200, "output": 4800},
    "requests": {"total": 18, "fallback": 2, "retries": 3},
    "cache": {"enabled": true, "hits": 154, "misses": 186, "hitRate": 0.4529}
  },
  "targets": [
    {
      "language": "en",
      "files": {"translated": 12, "failed": 0, "retried": 1},
      "units": {
        "total": 340,
        "translated": 182,
        "fromCache": 154,
        "untranslated": 4,
        "oversized": 0
      },
      "chars": {"source": 15200, "translated": 16900, "request": 8300},
      "tokens": {"input": 5200, "output": 4800},
      "requests": {"total": 18, "fallback": 2, "retries": 3},
      "cache": {"enabled": true, "hits": 154, "misses": 186, "hitRate": 0.4529},
      "judge": {
        "model": "gpt-4o",
        "threshold": 70,
        "scored": 182,
        "averageScore": 91.4,
        "belowThreshold": 5,
        "unscored": 0,
        "distribution": {
          "0-9": 0,
          "10-19": 0,
          "20-29": 0,
          "30-39": 0,
          "40-49": 1,
          "50-59": 1,
          "60-69": 3,
          "70-79": 12,
          "80-89": 40,
          "90-99": 95,
          "100": 30
        }
      }
    }
  ],
  "errors": []
}
```

## Relation to the judge quality report

`--judge` also writes a standalone quality report
(`translate-quality.<lang>.json` in the output directory) with per-segment
verdicts. The run report duplicates only its aggregate stats; per-segment
details stay in the quality report.
