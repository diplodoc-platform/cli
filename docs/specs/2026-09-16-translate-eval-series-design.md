# Eval series: the gate before a model or prompt change - design

**Date:** 2026-09-16
**Status:** approved for implementation
**Package:** `@diplodoc/cli`

## Goal

Make "run the eval before changing the translation model or the prompts" one reproducible command with a verdict that can be trusted: it must not flake on a healthy configuration, and it must not fail a candidate model for phrasing its translations differently.

Today `npm run translate:eval -- --real ...` runs the corpus once and applies strict per-run thresholds. One run is not a measurement: in a series of 8 runs of one configuration the same corpus produced 8 different results, and the harness itself fails runs for reasons that have nothing to do with the translation.

## Non-goals

- **CI automation.** No cron, no blocking check in a pipeline. The gate is a step a human takes when changing the model or the prompts; drift detection and release gating are separate questions with separate owners.
- **Ranking candidates.** "Is B better than A" is what `npm run translate:bench` answers, with a pairwise judge and a cost table. The eval answers "is B broken".
- **A baseline file in the repo.** Comparing a candidate against a recorded series of another model runs into the same metric that cannot be compared across models (see below).
- **Gating the CLI release.** The GitHub CI of this repository has no access to an internal gateway, so a real-model run cannot live there. The mock-mode e2e stays what it is: a guard for the harness itself.

## What the measurements say

A series of 8 runs of the same configuration (Eliza `deepseek-v4-flash`, ru->en corpus, 16 pages, 500 units) after the untranslated-unit fixes of `docs/specs/2026-09-16-translate-untranslated-units-design.md`:

| class                       | result over 8 runs                              |
| --------------------------- | ----------------------------------------------- |
| markup violations           | 0 in every run                                  |
| glossary violations         | 0 in every run                                  |
| untranslated lines          | 0 in 7 runs, 1 in one run                       |
| judge average               | 100/100 in every run                            |
| judge unscored pairs        | 1 pair of 409 in one run, which failed that run |
| similarity, average per run | 0.975 to 0.978                                  |

Three conclusions shape the criterion:

1. **Markup and glossary are objective and model-independent.** They stayed at zero across the series, and every violation ever seen in this corpus was a real defect. They gate at zero.
2. **Similarity cannot gate a model change.** `glm-5-2` scored 0.936 average with zero defects where `deepseek-v4-flash` scored 0.98 with zero defects: the metric measures distance from the reference phrasing, not quality. It stays a trend metric, off by default.
3. **The judge is neither a sufficient nor a stable gate.** It scored 100/100 in runs that shipped a whole page in russian - identity units never reach it by design - and in one run it left a pair unscored, which failed the run on its own. Its average stays a cheap sanity gate; an unscored pair stops being fatal.

The residual defect rate of a healthy configuration is therefore one untranslated line per eight runs, while every regression seen so far produced tens of lines on a single page (33 lines when `syntax/links.md` collapsed). A budget between zero and two does not decide whether a regression is caught; it decides how often a healthy configuration is called broken.

## Design

### `--repeats <n>`

`npm run translate:eval -- --repeats 3` runs the same configuration three times in a row, each run in its own `<workdir>/run-<i>` directory. The default stays 1, and a single run behaves exactly as today, including the report shape.

Thresholds apply to the **totals over the series**, not to each run. "Every run passes" is a stricter rule than a single run and would flake more, not less, which is the opposite of what a series is for.

### The verdict

With `--repeats 3`, the documented gate for a model or prompt change is:

```bash
npm run translate:eval -- --real --repeats 3 --max-untranslated 1 \
  --provider openai --api-base <gateway> --model <candidate> --auth <token file>
```

- markup violations over the series: 0 (default)
- glossary violations over the series: 0 (default)
- untranslated lines over the series: at most 1 (`--max-untranslated 1`)
- judge average: at least 70 (default), judge unscored pairs: see below
- similarity: reported, not gating

The budget of one line is the measured noise floor of a healthy configuration, and it is two orders of magnitude below any regression this corpus has produced.

### Judge unscored pairs

A pair the judge fails to score is a defect of the judge, not of the translation, and one such pair currently fails the whole run. It becomes fatal only when the judge misses more than 5% of the pairs it was sent, which is a malfunction rather than a hiccup. The count stays in the scorecard and in the JSON report either way. No new flag: the share is a constant with a comment.

### Output

A series prints one line per run plus an aggregate block:

```
run  markup  glossary  untranslated  similarity  judge
1    0       0         0             0.977       100.0
2    0       0         1             0.976       100.0
3    0       0         0             0.977       99.8

Series of 3 runs: markup 0, glossary 0, untranslated 1 (allowed 1)
Judge: 1227 units scored by deepseek-v4-flash, average 99.9/100, 1 unscored
Pages with defects: about.md (run 2)

Verdict: PASS
```

The JSON report of a series is `{repeats, runs: [<per-run report>...], totals, thresholds, failures, passed}`. A single run keeps today's shape, so nothing that reads the current report breaks.

### Documentation

`docs/translate-eval.md` gains a section "Before changing the model or the prompt": the command above, the pass rule, and the three things that are deliberately not gates - similarity because it is model-dependent, the judge average because it is blind to identity units, the judge's unscored pairs because they are its own flakiness. It also points at `docs/translate-bench.md` for the question the eval does not answer.

## Testing

- `run.spec.ts` / a new `series.spec.ts`: totals are summed across runs; the verdict uses the totals and not per-run verdicts; `--repeats 1` produces today's report shape; a run directory per repeat.
- `cli.spec.ts`: `--repeats` parses, rejects a non-positive value.
- `report.spec.ts` of the eval: unscored pairs below the share are reported and do not fail; above it they do.
- Mock mode covers all of this offline: `npm run translate:eval -- --repeats 2` must stay green and must not need credentials.

## Follow-ups, not in this change

- A pointer to the ritual from the neurotranslate tasklet in Arcadia, where the model and the prompts actually change.
- Drift detection (the same model behind the same name changing over time) - needs a scheduled run in Arcadia CI and an owner for the notification.
