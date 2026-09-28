# Additional consumer validation

## Conclusion

The candidate preserves source formatting on the selected Tracker, Forms,
Wiki and Games documents, but these measurements do **not** establish an
overall quality improvement. In particular, seeded runs contain more lines
with Russian text than the baseline. Some are intentional literals or existing
localized content, but there are also real untranslated edits and source
fallbacks. This series is not a green release-acceptance result.

The earlier [YTsaurus and Diplodoc comparison](2026-09-28-translate-markup-structure.md)
still demonstrates removal of a naturally occurring duplicate code span.
The broader corpus exposes limits of that conclusion: structural safety and
translation completeness must be assessed separately.

## Setup and provenance

- Baseline: `f14b47cd1531acbcde2a6e3e0ea99283fe47dc61`, the narrow strong-emphasis fix.
- Candidate runtime: `b0708ba2c7202ccf98fab1202a5c8c675d546ca4`.
- Node.js 24.18.0, the same installed dependencies and fixed validator for both.
- RU to EN, `deepseek-v4-flash`, OpenAI-compatible gateway, default prompts,
  adaptive code mode, batch budget 3000, output budget 16000, concurrency 3.
- Three repeats per revision and mode: 12 runs over the combined 12-page corpus,
  or 144 page translations. The generated TOC adds a thirteenth CLI input file.
- Full mode disables cache. Seed mode starts with a fresh per-run cache seeded
  from the unchanged RU/EN pair, then translates a controlled Russian edit.
- The edit prefixes one ordinary prose line per page with `Важное уточнение: `.
  English stays unchanged. This is not a historical production PR replay.
- The glossary is empty. The LLM judge is enabled as a supplementary signal.
  Provider token counters are not a total monetary-cost estimate for translation
  plus judge requests.

Tasklet usage for all four consumers was checked in their build configurations.
Internal configurations are not published here. This tests the CLI on consumer
documents, not the tasklet orchestration itself. The common fixed model differs
from some consumers' production configuration; Games' other target languages
are not covered.

The [corpus manifest](2026-09-28-translate-consumer-corpus.json) records public
official Markdown URLs, download time, raw and processed SHA-256 hashes, and
preprocessing. Only generated frontmatter and the initial Documentation Index
banner were removed. No private documentation or full copied articles are
committed. Pages are:

| Consumer | Pages                                                   |
| -------- | ------------------------------------------------------- |
| Tracker  | create-ticket, edit-ticket, notification-constructor    |
| Forms    | new-form, add-questions, send-request                   |
| Wiki     | create-page, wysiwyg/text-format, wysiwyg/tables-format |
| Games    | sdk-server-time, sdk-review, sdk-player                 |

Public Markdown exports are not original source trees. They contain some
rendering artifacts, and the Wiki export retains an unresolved relative
`yfmeditor/tables-format.md` include, reported by both binaries. This comparison
does not cover that included file or whole-site builds. Public RU/EN locales
also differ structurally; reference text is not a perfect expected output.

## Per-run results

Each cell lists repeats 1 / 2 / 3. All raw eval verdicts are FAIL; none was
discarded or replaced. The [machine-readable results](2026-09-28-translate-consumers-results.json)
contain per-consumer categories, raw failures, cache statistics, provider
counters, token usage and judge summaries for every run.

| Version / mode | Formatting findings | All markup findings | Lines with Russian text | Markup source fallbacks | Translation requests |
| -------------- | ------------------- | ------------------- | ----------------------- | ----------------------- | -------------------- |
| Baseline full  | 0 / 0 / 0           | 9 / 9 / 9           | 2 / 4 / 3               | 1 / 1 / 1               | 75 / 74 / 73         |
| Candidate full | 0 / 0 / 0           | 9 / 9 / 9           | 1 / 1 / 3               | 0 / 0 / 1               | 26 / 26 / 75         |
| Baseline seed  | 3 / 3 / 3           | 103 / 103 / 103     | 6 / 6 / 7               | 0 / 0 / 0               | 15 / 15 / 15         |
| Candidate seed | 0 / 0 / 0           | 98 / 99 / 99        | 13 / 8 / 8              | 0 / 0 / 1               | 15 / 15 / 15         |

Seed cache hits were 1004 / 1006 / 1007 out of 1224 unit occurrences for the
baseline, and 997 / 997 / 1001 for the candidate. Both used 11 memory hints per
run. Incremental reuse is exercised, rather than merely running the seed command.

The full-run request difference is not a stable speedup. A malformed Forms batch
triggered one-by-one recovery in every baseline repeat and in candidate repeat 3. These expensive and partly untranslated runs remain in the measurements.

## Interpreting the findings

### Existing formatting in translation memory

The three baseline seeded formatting findings occur on Forms add-questions,
Forms send-request and Tracker notification-constructor. Inventory comparison
against the existing English documents confirms the extra bold elements are
already present there, not newly invented by this run's model.

An offline replay of the candidate's cache validator rejects six stored source/
target pairs across those pages because their formatting differs. This accounts
for at least part of the changed cache-hit and batching behavior. The candidate
removes the source-relative discrepancies, but this is not by itself an
improvement over an approved existing locale. The desired policy for existing
localized formatting needs separate consideration from model-added markup.

### Code, links and untranslated text

- The nine full-run markup findings are in Games code fences. Adaptive mode
  translates comments or example text; the independent checker requires
  byte-identical fence bodies. Both versions retain the same raw finding count.
- Seeded runs retain many existing localized URLs and localized code examples,
  so source-relative link/fence differences dominate the raw totals. These are
  not evidence that the model invented that many links.
- Both versions also log existing localized links that revert to source URLs
  on selected pages. This is a limitation, not silently accepted output.
- Candidate full repeats 1 and 2 preserve the literal `код-цвета` inside inline
  code on the Wiki table page. This accounts for their one Russian-text finding.
  In repeat 3 the surrounding sentence is Russian too, so that finding is no
  longer only a literal-code false positive.
- Forms contains actual untranslated prose in full mode. Seeded runs also leave
  the controlled Russian prefix untranslated on some pages. The candidate's
  first seeded repeat retains additional Games text in Russian.
- Some seeded findings contain an existing Russian product name in otherwise
  English text. Raw line counts are retained instead of treating every match
  as a newly introduced translation failure.
- High average judge scores do not settle these issues. Candidate seed repeat
  3 averages about 99.3/100 while five pairs score below 70, including an
  untranslated edit and a reported meaning change.

The result supports the narrower claim that source-relative formatting is
protected. It does not justify merging on a claim of universally better
translation. Before acceptance, investigate incremental translation completeness
and decide how existing approved formatting should interact with the guard;
then repeat the same fixed corpus without dropping these initial results.

## Offline regression coverage and reuse

`src/commands/translate/providers/ai/__fixtures__/markup-regressions.json` adds
six independently authored documents with explicit expected Markdown. Eleven
provider-level tests cover invented lists, links, paragraphs and code spans,
the minimized observed YTsaurus case, and legitimate literal markers. Persistent
failure cases assert source fallback, unchanged healthy units, absence of Russian
fallback text in persisted cache snapshots, and the next run's output/retry.

With the structural guard temporarily bypassed, ten tests fail and the literal
control passes. After restoring it, all eleven pass. The complete unit suite
passes with 2707 tests and one skip; typecheck passes and lint has no errors
(four existing warnings). The ordinary offline eval also passes. No product
runtime code was changed during this additional validation series.

The separate [validation guide PR #2311](https://github.com/diplodoc-platform/cli/pull/2311)
documents corpus selection, isolated full/seed runs, all-repeat reporting and
conversion of live incidents into regression fixtures. Its wrapper arguments,
report paths and rejection of reused seed caches were checked locally. The
wrapper is real-model-only; the ordinary CLI must be used for mock unit capture.
