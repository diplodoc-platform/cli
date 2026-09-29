# Standalone table title follow-up

The [previous comparison](2026-09-28-translate-consumer-followup.md) found an
untranslated standalone `{wide-content title="Название таблицы"}` attribute.
[translation PR #293](https://github.com/diplodoc-platform/translation/pull/293)
addresses its extraction contract. This report validates that unpublished
library change with the same CLI runtime and public document snapshots.

## Cause and bounded correction

The extractor previously exposed the entire attribute to a model instructed to
preserve YFM syntax. That instruction conflicts with translating its title.
The default Markdown extractor now exposes only the human-readable title while
protecting the surrounding directive, other attributes and Liquid variables.
Composition escapes newly introduced quotes and trailing backslashes for the
original delimiter. It does not reinterpret literal code, headings, unrelated
directives, malformed attributes or duplicate titles. The separate experimental
parser is unchanged.

Review also found discrepancies between normalized inline tokens and the raw
skeleton: container prefixes, trailing whitespace and unquoted variable values.
Regression cases cover these forms, including concatenated variables. General
string replacement remains unchanged; escaping is applied only by Markdown
composition in the recognized title context.

The library adds 59 focused tests across compact and non-compact modes. The
complete library suite passes 579 tests with four skipped; typecheck, build and
changed-file lint pass. With the locally packed library, the CLI passes 2743
tests with one skipped, typecheck and ordinary offline evaluation.

## Repeated live comparison

The model is `deepseek-v4-flash`, Russian to English, temperature zero, adaptive
code translation, with the judge enabled. Every series has three serial repeats.
Full runs disable cache; each seeded repeat starts from a fresh cache populated
from the original Russian and approved English, then translates controlled edits.
All runs enforce zero untranslated prose lines. No threshold was relaxed after
seeing results. Earlier reports retain their original thresholds and verdicts.

Fresh control runs on the published library translated the table title 3/3.
The patched library also translated it 3/3 and preserved its literal examples.
Thus this small fresh sample does **not** establish a reduced live failure rate.
The earlier captured failure and deterministic extraction/composition tests
establish the contract defect and its correction.

The first patched Diplodoc repeat still retains the ordinary prose sentence
`Стандартная разметка для ссылки имеет вид:` in `syntax/links.md` after a model
retry. It is outside the changed table-title path. The independent evaluator
correctly reports FAIL; the provider reports one retained untranslated unit.
The judge gives this run an average of 100 with no low scores, demonstrating
why its assessment cannot replace the completeness check. The other two repeats
have no untranslated-prose findings. No successful rerun replaces this failure.

Tracker, Forms, Wiki and Games use the same twelve-page public snapshot and
controlled edits as the previous comparison. All three full and all three
seeded repeats retain zero untranslated lines, zero markup source fallbacks,
zero glossary findings and zero low judge scores.

| Corpus / dependency / mode      | Requests     | Untranslated lines | Raw markup findings |
| ------------------------------- | ------------ | ------------------ | ------------------- |
| Diplodoc / published / full     | 18 / 17 / 18 | 0 / 0 / 0          | 0 / 0 / 0           |
| Diplodoc / patched / full       | 19 / 17 / 19 | 1 / 0 / 0          | 0 / 0 / 0           |
| Four consumers / patched / full | 29 / 27 / 27 | 0 / 0 / 0          | 9 / 9 / 9           |
| Four consumers / patched / seed | 16 / 17 / 17 | 0 / 0 / 0          | 105 / 105 / 105     |
| YTsaurus / patched / full       | 18 / 18 / 18 | 0 / 0 / 0          | 7 / 7 / 7           |

Seeded cache hits are 1008 / 1006 / 1011 of 1224 occurrences, with eleven memory
hints per repeat. Every source-language retry completes successfully in these
consumer runs. Request counts exclude the judge and are not a monetary cost
comparison. No fresh published-library consumer series was run for this narrow
library change; the before/after CLI comparison remains in the earlier report.

All raw consumer verdicts remain FAIL. Independent classification finds the
same categories as before, not new unexplained formatting:

- Full: three changed fence bodies match approved English examples, while six
  retain their JavaScript token streams, changing comments or whitespace.
- Seed: 89 localized destinations occur in the approved English page; nine
  changed fences match reference examples and four preserve JavaScript tokens.
  Three additional findings preserve reference formatting. No formatting
  inventory exceeds both source and approved reference inventories.

Reference membership establishes provenance, not semantic equivalence or correct
placement by itself. These classifications do not change the raw verdicts.

YTsaurus has the same seven adaptive fence differences in each run: two Mermaid
label translations, four YAML comment changes and one YSON example with translated
placeholder text. The YSON comment itself remains Russian, outside the prose
completeness check. There are no new formatting findings, untranslated prose,
markup source fallbacks or low judge scores. Each repeat repairs one rejected
markup response. This is not a claim that adaptive mode translates every comment.

The series contains fifteen live runs and 177 evaluated pages, including three
fresh published-library control runs. The twelve patched-library runs account
for 129 of those pages. All counts, raw failures, thresholds, token usage,
per-page output hashes and independent consumer classifications are retained in
the [machine-readable results](2026-09-29-translate-table-title-results.json).

## Reproducibility and integration

CLI source revision: `af61d3985d7b4009259272a60ac4c337a9183f31`; runtime revision:
`324491a599cd0f9e85ea37f2e123baec267f56e2`. The CLI binary was not rebuilt during
the series. Its dependencies are external, so binary identity alone is not
sufficient to identify the tested implementation.

The library comparison uses published 1.10.0 at
`875e8823f52b71bd9d2259624193a383e752504b` versus locally packed revision
`55c1d76e154cc41b1b654e6c7c863d00dc17c2ec`. The tarball still carries version
1.10.0; it is not an npm release. Exact runtime hashes and per-run settings are
recorded in the accompanying results. No package manifest or lockfile was
changed to disguise the local package as an available release.

SonarCloud subsequently requested simpler regexes and explicit alternative
grouping. Final library revision `3585254547bf3cbf7b54f291a58894e2274a349e` splits
attribute-name and value scanning. Live runs remain attributed to `55c1d76`,
not silently relabeled as runs of the final build. A deterministic comparison
of 155236 scanner/escaping inputs found no differences; extraction and composition
also matched on all 263 source, reference and saved output documents in both
compact modes (526 comparisons). The full library suite still passes.
The final packed package also passes all 2743 CLI tests and offline evaluation.
Library PR CI passes on Linux, macOS and Windows, including SonarCloud after the
refactor. The published dependency was restored after local validation; the
unpublished tarballs and raw run artifacts remain separate from the checkout.

The library must be released and the CLI dependency updated before users receive
the title correction. CLI PR #2308 alone, installed with published 1.10.0, does
not contain this library fix. The earlier CLI improvements and cache migration
requirements remain as documented in the previous comparison.

These are selected public-page experiments, not complete site builds, tasklet
deployment tests or a guarantee across models. The Wiki snapshot retains an
unresolved include. The residual prose echo remains visible and prevents a claim
that all translation defects have been eliminated.
