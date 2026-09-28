# Preserving translation markup structure

See the [consumer follow-up](2026-09-28-translate-consumer-followup.md) for later
runtime revisions, repeated consumer runs and remaining limitations. The
historical measurements below are retained unchanged. Complete inline-code
spans are now protected; adaptive fenced examples remain translatable.

## Change

The previous fix removed only invented internal `**...**` and `__...__`
from plain fragments. It did not cover added code spans, links, lists or
other markup. This change replaces that delimiter scanner with validation
using the same `@diplodoc/translation` parser as the translation pipeline.

After existing safe edge repairs, render the source and translated unit
with its boundary markers, then compare structural inventories. Keep
nesting, marker types, skeleton and paragraph boundaries; ignore prose
and generated placeholder IDs. Sibling inline elements may move with the
translated sentence. Code-example text remains translatable.

Units that change structure get one formatting-repair attempt with an
explicit preservation instruction. If it fails, keep the source and do
not persist the damaged answer in the translation cache. Existing report
counters expose these retries and source fallbacks. Cached translations
are checked too, without discarding legitimately localized seeded URLs.

The independent eval now parses Markdown formatting, including paragraphs,
inline code and emphasis. It does not call the runtime validator, so an
omission in that validator need not be an omission in the measurement.

## Comparison setup

Measured on 2026-09-28 with Node 24.18.0, `@diplodoc/translation` 1.10.0,
`deepseek-v4-flash` through the OpenAI-compatible Eliza gateway, RU to EN,
temperature 0, cache disabled, default prompts and `--code adaptive`.
Both versions use the same dependencies and settings within each corpus.
Baseline is PR #2308 at `f14b47cd1531acbcde2a6e3e0ea99283fe47dc61`,
including its narrow strong-emphasis fix and NUL cleanup.

- Diplodoc: the 16 pages in `tests/eval/corpus`, 6 glossary entries,
  775 unit occurrences per run, batch budget 8000, output budget 4000.
- YTsaurus: three complete public pages, no glossary, 823 unit occurrences
  per run, batch budget 3000, output budget 16000. All RU and EN files were
  downloaded from the public `ytsaurus/ytsaurus` repository, not internal
  review attachments. Paths relative to `yt/docs/{ru,en}/_includes/`:
  `admin-guide/native-encryption.md`, `faq/faq-dynamic-tables.md`,
  `user-guide/dynamic-tables/sorted-dynamic-tables.md`.

Public source Git blob hashes, in the order above:

| Language | native-encryption                        | faq-dynamic-tables                       | sorted-dynamic-tables                    |
| -------- | ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| RU       | 624ed02149fa736c5fc2ca1e98cf38e67953651f | b9441ce66613ae613eb578e777a850abc8f4fb7b | 19541ea2cd912a41b239a561b1da030cad20343f |
| EN       | 32c4922424429253fd19527c5f983a8eb72bb591 | 74499d314d23ad0f0e85def00b036cad736d3c25 | 6175cf952243a5b0fc58e3d5201dc645d87c3bc2 |

## Observed defect

In `sorted-dynamic-tables.md`, the source refers to `$ttl` once, then says
"this column". All three baseline runs expanded that reference into another
code span:

```text
Source: ... значения `$ttl` ... записанное в эту колонку ...
Baseline: ... the `$ttl` column ... as the `$ttl` value ...
```

The strong-only fix accepts this because no new bold delimiters are
present. Structural validation detects the extra code span and re-requests
the fragment. This is a naturally occurring model response, not an injected
test fault. A unit regression also preserves this case.

## Final results

Three baseline and three final-candidate runs per corpus, twelve runs in
this comparison. Both versions' output was rescored with the final
independent checker. Values in each cell are runs 1, 2 and 3.
The [machine-readable results](2026-09-28-translate-markup-structure-results.json)
also retain token counts, judge counts and raw full-eval verdicts.

| Corpus / version   | Formatting violations | Markup retries (units) | Untranslated units | Translation requests | Duration, seconds   |
| ------------------ | --------------------- | ---------------------- | ------------------ | -------------------- | ------------------- |
| Diplodoc baseline  | 0 / 0 / 0             | 0 / 0 / 0              | 0 / 0 / 0          | 18 / 20 / 19         | 45.5 / 40.6 / 37.2  |
| Diplodoc candidate | 0 / 0 / 0             | 0 / 0 / 0              | 0 / 0 / 0          | 17 / 17 / 19         | 38.7 / 45.7 / 53.2  |
| YTsaurus baseline  | 1 / 1 / 1             | 0 / 0 / 0              | 0 / 7 / 0          | 17 / 18 / 17         | 72.8 / 64.3 / 73.0  |
| YTsaurus candidate | 0 / 0 / 0             | 2 / 1 / 1              | 0 / 0 / 2          | 18 / 18 / 89         | 67.4 / 75.0 / 128.2 |

No candidate run fell back to source because of markup (`markupDamaged = 0`).
All six Diplodoc full evals passed. All YTsaurus full evals failed the
byte-identical fence-content check described below. Baseline YTsaurus run 2
also retained five untranslated prose lines; candidate run 3 retained two.
Every judge average was 100/100, which clearly does not detect these failures.

Candidate YTsaurus run 3 returned 64 answers for an initial 66-fragment
request. The existing split-to-single-fragments recovery and identity retries
account for its 89 requests; two fragments stayed in Russian after identity
retry. This happened before structural validation, not because its check
rejected the translations. The report keeps this outlier rather than
replacing it with a favorable rerun. The earlier candidate series also had
a 222-second run with 30 transport retries. Wall-clock improvement is not
claimed.

Conclusion: broader formatting protection is demonstrated by a naturally
repeated defect, with no formatting or untranslated-text regression on the
Diplodoc corpus. This is not evidence that every translation now succeeds:
batch framing and untranslated responses remain separate failure modes.

## Measurement caveats

The strict full-page evaluator also reports seven `fence-content` changes
in every YTsaurus run: six in native-encryption and one in sorted tables.
Inspection shows translated Mermaid labels, YAML comments and example
placeholders (`<имя колонки>` to `<column name>`). This is existing adaptive
code translation, shared by both versions, not a new formatting defect.
These raw failures remain in the reports; they are not silently waived or
reported as a fully green eval. The formatting-inventory comparison is
reported separately from these code-content checks.

The judge uses the same model and is supplementary evidence, not proof of
translation quality. Three runs on two corpora and one language pair do
not guarantee preservation of every possible YFM extension or semantic
association between formatting and translated words.

## Iterations rejected before the final comparison

- Comparing inline-code **content**, not just its structure, caused seven
  legitimate example translations to fall back to Russian in each of three
  Diplodoc pilot runs. That restriction was removed.
- Checking seeded localized addresses literally invalidated existing
  translations. The existing localized-seed tests exposed this; validation
  now normalizes addresses for comparison only, preserving cached output.
- Review found that deleting all skeleton whitespace hid new paragraphs.
  Block breaks and independent paragraph-token checks now have regressions.
- An initial YTsaurus run used an 8000-token batch with a 4000-token answer
  budget and split truncated answers into individual retries. It was stopped;
  both measured versions use the same 3000/16000 budgets instead.

## Reproduction

Build the baseline and candidate separately with the same locked dependencies.
Use the exported `runEval` API with `real: true`, `judge: true`, `noCache: true`,
one fresh `workdir` per run and a `runReport` path. Repeat three times for each
CLI/corpus combination. Set the same provider, model, endpoint and credential
file for both, plus RU/EN locales and the budgets above. For the YTsaurus
budget, a small CLI wrapper can append `--max-batch-tokens 3000
--max-output-tokens 16000` before spawning the selected CLI.

Use `DEFAULT_THRESHOLDS` with `maxUntranslated: 1`; do not raise the markup
threshold to conceal the adaptive fence-content failures. The temporary
YTsaurus corpus contains unchanged downloaded pages at `ru/<basename>.md`
and `en/<basename>.md`, a minimal `toc.yaml` in each language and an empty
`glossary.yaml` (`[]`).

Score both versions' saved pages with the final independent `compareMarkup`.
Inspect `fixes.markupRetried`, `fixes.markupDamaged`, `units.untranslated`,
request counts and tokens in the run reports, not only the judge average.
Keep translated pages and raw eval/run reports to diagnose every violation.
