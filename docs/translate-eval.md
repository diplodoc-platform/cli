# Translation quality eval

The eval harness measures how well `yfm translate` translates a fixed
reference corpus and produces a scorecard. Run it before changing the
translation prompts or models and before rolling the translation
tooling out.

## Quick start (no credentials required)

```bash
npm run translate:eval
```

The default mode needs no network and no API keys: the corpus reference
translations are served by a local mock provider through the real
`yfm translate` pipeline (extract, batching, prompts, compose, judge).
This validates the whole pipeline and the harness itself, and any
corpus or pipeline regression turns the verdict red.

The run prints a human-readable scorecard and writes a JSON report
(path is printed at the end, override with `--report <path>`):

```
page                markup  glossary  untranslated  similarity  judge<t
about.md            ok      ok        ok            1.000       ok
syntax/code.md      ok      ok        ok            1.000       ok
...

Judge: 410 units scored by eval-mock, average 100/100, 0 below threshold 70

Verdict: PASS
```

## Evaluating a real model

With provider credentials, the same corpus is translated by a real
model and scored by the LLM judge:

```bash
OPENAI_API_KEY=... npm run translate:eval -- --real --provider openai --model gpt-4o-mini
```

`--provider`, `--model`, `--judge-model`, `--auth`, `--api-base` and
`--folder` are passed through to `yfm translate`. To compare models
systematically, use the benchmark: [docs/translate-bench.md](translate-bench.md).
It runs this eval per candidate and adds a pairwise comparison against a
baseline model.

## Before changing the model or the prompt

One run is not a measurement: the same configuration produces a
different result every time, because the batches a run composes depend
on timing. Run a series and read the totals:

```bash
npm run translate:eval -- --real --repeats 3 --max-untranslated 1 \
  --provider openai --api-base <gateway> --model <candidate> --auth <token file>
```

The pass rule, over the three runs: markup violations 0, glossary
violations 0, untranslated lines at most 1, judge average at least 70.
Thresholds apply to the totals of the series, not to each run.

Why the budget is one line: it is the measured noise floor of a
healthy configuration (one untranslated line in eight runs), two
orders of magnitude below any regression this corpus has produced - a
broken configuration returns whole pages in the source language.

Three things are deliberately not gates:

- **similarity** measures the distance from the reference phrasing,
  not quality: a different model translates correctly and phrases
  differently (0.936 against 0.98 with zero defects in both cases), so
  it compares a model against its own history and never accepts or
  rejects a candidate;
- **the judge average** never sees the defect that matters most,
  because a unit returned untranslated is not scored at all, by
  design;
- **unscored judge pairs** are the judge's own flakiness: a run
  tolerates them and fails only when the judge misses more than 5% of
  the pairs.

The eval answers "is this configuration broken". For "is this model
better than that one" there is the benchmark,
[docs/translate-bench.md](translate-bench.md).

## What is checked

- **Markup preservation** (deterministic, source vs translation): code
  fences are byte-identical, liquid/YFM directives (notes, cuts, tabs,
  includes, conditions) keep their order and parameters, link and image
  targets survive, heading structure and explicit anchors survive,
  `{{variables}}` survive, table layout survives.
- **Glossary** (deterministic): every glossary term used on a source
  page must be rendered with its required translation
  (`tests/eval/corpus/glossary.yaml`, also passed to `--glossary`).
- **Untranslated segments** (deterministic): no source-script text
  outside code fences, except lines the reference translation keeps
  in the source language on purpose.
- **Reference similarity**: token-level F1 against the reference
  translation. A trend metric: real models phrase things differently,
  so it does not gate the run unless `--min-similarity` is set.
- **LLM judge**: the existing `--judge` scoring of the translate
  command. The judge report is folded into the scorecard: average
  score, per-page segments below the threshold. In mock mode the judge
  requests are answered deterministically by the mock provider.

## Reading the report

The JSON report (`eval-report.json`) contains the same data as the
scorecard: `pages[]` with per-page violations (`markupViolations`,
`glossaryViolations`, `untranslated`, `similarity`, `judgeLow`),
`judge` summary, `thresholds`, `failures` and the overall `passed`
verdict. The process exits non-zero when the verdict is FAIL, so the
eval can gate CI or a release pipeline.

With `--repeats` above 1 the report is a series, a different shape:
`{repeats, runs: [<per-run report>...], totals, thresholds, failures,
passed}`. `runs` holds one full per-run report as above; `totals` is
what the thresholds are actually applied to.

Thresholds are strict by default (zero violations, judge average at
least 70) and can be tuned:

```bash
npm run translate:eval -- --max-untranslated 5 --min-judge-score 80 --min-similarity 0.5
```

## Corpus

The corpus lives in `tests/eval/corpus` (see `tests/eval/README.md`
for the page list and editing rules). Sources are under `ru/`,
unit-aligned reference translations under `en/`. The harness verifies
the alignment on every run: misaligned pages are reported as failures
together with translation memory misses.

Useful debug artifacts are kept in the working directory (printed as
`Eval workdir`): translated output (`out/`), captured translation
units of both corpus sides (`units.json`) and the raw judge report
(`out/translate-quality.<lang>.json`).

## Options

| Option                                                                       | Default                      | Meaning                                                       |
| ---------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| `--corpus <dir>`                                                             | `tests/eval/corpus`          | corpus location                                               |
| `--source` / `--target`                                                      | `ru-RU` / `en-US`            | language pair                                                 |
| `--real`                                                                     | off                          | translate with a real provider instead of the mock            |
| `--no-judge`                                                                 | judge on                     | skip LLM judge scoring                                        |
| `--repeats <n>`                                                              | 1                            | run the series n times and apply the thresholds to the totals |
| `--provider`, `--model`, `--judge-model`, `--auth`, `--api-base`, `--folder` | -                            | passed to `yfm translate` in real mode                        |
| `--workdir <dir>`                                                            | temp dir                     | working directory                                             |
| `--report <path>`                                                            | `<workdir>/eval-report.json` | JSON report path                                              |
| `--max-markup-violations <n>`                                                | 0                            | allowed markup violations                                     |
| `--max-glossary-violations <n>`                                              | 0                            | allowed glossary violations                                   |
| `--max-untranslated <n>`                                                     | 0                            | allowed untranslated lines                                    |
| `--min-judge-score <n>`                                                      | 70                           | minimal judge average, also the judge threshold               |
| `--min-similarity <x>`                                                       | 0 (off)                      | minimal per-page similarity                                   |
