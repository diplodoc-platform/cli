# Consumer translation follow-up

The [September 29 library follow-up](2026-09-29-translate-table-title.md)
addresses the standalone title extraction defect recorded below. Historical
measurements and unsuccessful outcomes in this report remain unchanged.

This follows the [initial unsuccessful consumer comparison](2026-09-28-translate-consumers.md).
Those measurements remain unchanged. Runtime revision under validation:
`324491a599cd0f9e85ea37f2e123baec267f56e2`; baseline remains
`f14b47cd1531acbcde2a6e3e0ea99283fe47dc61`.

## Result on the fixed consumer corpus

The final revision improves translation completeness on the selected Tracker,
Forms, Wiki and Games pages without losing approved formatting or adding new
unaccounted markup. Each cell below contains all three repeats. Baseline output
is rescored with the same final independent checker, not regenerated or selected
for a favorable comparison.

| Version / mode | Untranslated prose lines | Markup source fallbacks | Translation requests | Low judge scores |
| -------------- | ------------------------ | ----------------------- | -------------------- | ---------------- |
| Baseline full  | 2 / 4 / 3                | 1 / 1 / 1               | 75 / 74 / 73         | 0 / 0 / 0        |
| Final full     | 0 / 0 / 0                | 0 / 0 / 0               | 25 / 29 / 27         | 0 / 0 / 0        |
| Baseline seed  | 3 / 3 / 4                | 0 / 0 / 0               | 15 / 15 / 15         | 6 / 7 / 7        |
| Final seed     | 0 / 0 / 0                | 0 / 0 / 0               | 18 / 18 / 18         | 0 / 0 / 0        |

Final seed cache hits are 1010 / 1010 / 1007 out of 1224 occurrences, with
11 memory hints per run. Copied insertions are retried in all three runs; none
remains untranslated or is persisted as a successful answer. Full repeats 2
and 3 reproduce a missing response fragment and recover through smaller batches.
Repeat 2 also needs to split a 22-unit sub-batch. Thus the successful outcome
includes the observed failure path, not only fortunate well-formed responses.

Incremental translation costs three additional requests relative to the baseline
to correct missed edits and avoid incorrect seed pairs. Full-run requests decrease
because a malformed batch no longer immediately fans out into 44 single requests.
These are translation-request counts, not total monetary cost including the judge;
no universal speed or cost reduction is claimed.

### Why strict raw verdicts remain red

The raw checker reports 9 markup differences in each final full run and 105 in
each final seed run. These are retained in the
[machine-readable evidence](2026-09-28-translate-consumer-followup-results.json),
along with every earlier unsuccessful iteration, per-page output hashes, token
counts and judge summaries. They were classified independently of the runtime:

- Full: three changed fence bodies match an existing English example; the other
  six preserve the exact JavaScript token stream, changing comments/whitespace.
- Seed: all 89 localized destinations occur in the existing English page.
  Nine changed fence bodies match existing English examples, and four preserve
  their JavaScript token stream. Three formatting findings preserve emphasis
  already present in the approved locale. No added formatting inventory exceeds
  both the source and reference inventories.
- The seed total increases from 103 to 105 because two previously reverted
  localized links are now preserved. This is not two new broken links.

The final six consumer runs have no untranslated-prose findings, no markup
source fallbacks, no glossary findings and no low judge scores. An earlier
identity-safe diagnostic flagged "Request expires in 5 seconds"; that exact
wording is already on line 93 of the existing Forms English snapshot. It is
retained in the diagnostic record, not presented as a newly generated regression.

## Root causes and corrections

1. **Approved locale versus generated cache.** The structural guard rejected six
   seed pairs whose English formatting intentionally differed from Russian.
   Seed provenance now preserves approved formatting. Generated answers still
   pass the guard; copying an old model cache does not grant seed provenance.
2. **Partially untranslated edits.** An equality-only echo detector missed a
   Russian insertion attached to otherwise English text. A source-script word
   introduced by an edit is checked outside code, addresses and glossary terms.
   A failed edit is retried without misleading memory and document context.
   A persistently incomplete answer is reported and not cached. This is a
   bounded retry, not a guarantee that every model response translates correctly.
3. **Incorrect seed alignment.** Unanchored paragraphs in divergent sections
   were paired by matching shape, yielding unrelated English sentences on
   Tracker pages. Such gaps now require matching surrounding structure.
   Code comment indentation is normalized inside fences, preventing a Games
   comment about 24 hours in milliseconds from matching a later reward condition.
4. **Localized destinations lost after a prose edit.** Requests hide URLs from
   the model, then restored the Russian destination. Composition now restores
   the unique approved localized destination from that file's memory, including
   autolinks. Ambiguous destinations are not guessed; literal code is untouched.
5. **The model translates literal code despite instructions.** On a Wiki fragment,
   five of six isolated responses changed a literal; the sixth echoed the source.
   An explicit preservation instruction did not help. Complete inline-code spans are
   now opaque in requests and restored exactly. Content-derived identities allow
   reordering; exact multiplicities reject duplicate or missing literals.
   Fenced adaptive code translation and partial spans crossing unit boundaries
   retain their existing behavior. This differs from merely rejecting translated
   inline code: surrounding prose can translate without a source fallback.
6. **Measurement false positives.** Russian text inside inline code and harmless
   whitespace differences around an existing Russian product name were counted
   as untranslated prose. The independent evaluator parses inline Markdown and
   normalizes whitespace when comparing approved reference lines. Saved baseline
   outputs are rescored with the same checker; original raw reports are retained.
   Runtime echo counters also exclude protected code and placeholder attributes;
   otherwise an intentionally unchanged YFM attribute triggers pointless retries.
   Reference exemptions now consider only reference prose, never fenced examples.
   The offline capture server also recognizes context-free language retries as
   repeats of the preceding batch, rather than inventing an unnamed document.
7. **Premature completion of a batch.** A captured 44-unit response stopped after
   unit 43 with `finish_reason=stop`, far below its output budget. Its final unit
   was omitted, not truncated by the transport. Recovering all units individually
   cost 44 extra requests and exposed repeated source echoes. Recovery now splits
   a malformed batch in half sequentially, down to individual units only when
   necessary. It never guesses which returned text belongs to a missing unit.
   Failed repair halves retain positional empty entries, preventing answer shifts.
   Every language retry omits the automatic document title/context; explicit
   user instructions, context files and glossary remain in force.

No stronger system prompt was adopted: an isolated memory experiment still
copied the inserted Russian phrase in all three responses after clarification.
Removing memory translated all three. A later replay of an exact failed retry
echoed once in three original requests, versus zero in three without document
context. These small experiments guide implementation, not statistical guarantees.

## Additional corpora and an unresolved title

The final runtime was also repeated three times on the same three YTsaurus
pages and sixteen Diplodoc pages used in the
[earlier comparison](2026-09-28-translate-markup-structure.md). Together with
the consumer runs, that is twelve final live runs and 129 page translations.

| Corpus   | New formatting findings | Untranslated lines after rescore | Markup source fallbacks | Requests     | Low judge scores |
| -------- | ----------------------- | -------------------------------- | ----------------------- | ------------ | ---------------- |
| YTsaurus | 0 / 0 / 0               | 0 / 0 / 0                        | 0 / 0 / 0               | 18 / 18 / 18 | 0 / 0 / 0        |
| Diplodoc | 0 / 0 / 0               | 1 / 0 / 0                        | 0 / 0 / 0               | 19 / 18 / 18 | 0 / 0 / 0        |

YTsaurus still has seven raw fence-content findings per run, covering adaptive
comments, example text and Mermaid labels as in the earlier comparison. Its
extra `$ttl` code span is absent in all three final runs, versus present in all
three baseline runs. Its raw verdict remains FAIL, not an unconditional pass.

Diplodoc run 1 retains `{wide-content title="Название таблицы"}` outside a
code fence at line 78 of `syntax/tables/gfm.md`. The provider reports one
untranslated unit and does not cache it. The old evaluator misses this because
the English reference contains the same line inside a fenced example. The
corrected evaluator finds it. The saved raw PASS also used an allowance of one
untranslated line, unchanged during the comparison; a zero-miss acceptance
criterion fails this run. No threshold is raised to hide the residual.

This is an unresolved extraction/prompt contract mismatch: the extractor exposes
the entire standalone attribute while the prompt requires YFM syntax to remain
unchanged. A proper follow-up must extract its human-readable title separately
and preserve the attribute syntax, with quoted-title and literal-code controls.
Blindly translating every quoted directive value would risk identifiers and
configuration. This PR demonstrates better formatting preservation and consumer
translation completeness, not elimination of every translation defect.

## Cache migration

The generated-answer fingerprint includes validation policy 2. Earlier model
answers can contain partial edits or altered literals and are not reused.
Seed format 4 rejects pairs produced by the previous alignment policy. Run
`yfm translate seed` again against the original source and approved locale before
translating changed source. Do not seed from the candidate's generated output.
This can increase the first run's request count after upgrading.

## Evidence rules

The [fixed public corpus](2026-09-28-translate-consumer-corpus.json), controlled
edits, model, prompts, token budgets and target language are unchanged. Each
final variant is repeated three times with a fresh cache or cache disabled.
Final runs execute sequentially. Earlier overlapping diagnostics hit the
gateway's five-request limit; they remain in the record and are not timing
evidence. The final revision is not rebuilt during a series.

All strict source-relative markup verdicts are retained. Existing localized
links, approved emphasis and adaptive code comments are not newly invented
markup. Classify these differences explicitly instead of raising thresholds.
The judge is supplementary and may flag preserved reference wording.

## Regression checks

Eight authored document fixtures produce thirteen provider-level tests. They
exercise real extraction, seeding, composition and persistent cache with only
the model replaced. Disabling the structural guard fails ten assertions while
three preservation controls pass. Restoring it passes all thirteen. Disabling
literal protection separately fails its new document case.

Unit tests also cover copied insertions, approved seed formatting, divergent
paragraph alignment, reindented comments, localized autolinks, reordered code,
duplicate code identities, valid retries restoring the same text, and stale
cache migration. The full suite passes 2743 tests with one skip; typecheck and
build pass, changed TypeScript files have no lint warnings, and ordinary offline
evaluation passes. Independent review findings on literal identity and stale
retry validity were reproduced and corrected before the final series.

## Limits

This is evidence on the selected public snapshots, RU to EN and one fixed model,
not proof for every document or language. Public exports contain an unresolved
Wiki include and do not cover complete site builds or tasklet orchestration.
Matching structural sequences cannot prove semantic equivalence of arbitrary
locales. Shared-script language pairs are outside the untranslated-script
heuristic; inserted words already present in the seed vocabulary can escape its
new-word check. Failed model responses still have bounded retries and visible reports.
