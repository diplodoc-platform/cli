# Translation memory hints for changed units - design

**Date:** 2026-09-22
**Status:** approved for implementation
**Package:** `@diplodoc/cli`

## Goal

Stop retranslating an edited sentence from scratch. Today `yfm translate` with a seed (`yfm translate seed`) reuses the existing translation of every unchanged unit and sends only the changed units to the model - but a changed unit arrives at the model alone, without its previous version, so a one-word edit in the source comes back as a rewritten sentence. The reviewer of the translated page then has to reread the whole paragraph to find the one real change, and the wording drifts between edits.

The target state: a changed unit is sent together with its previous source, the existing translation of that previous source and the word-level changes between the two versions, with the instruction to apply exactly these changes to the existing translation.

## Measurements

Measured on 2026-09-22 on the Tracker documentation (`docs/support/tracker/common`, ru -> en), 37 changed units: 10 real point edits from the repository history and 27 synthetic ones (a number, an appended sentence, a removed sentence, a synonym) on pages whose translation aligns with the source. Translator `deepseek-v4-flash` at temperature 0 with the production prompt and context files; judge `glm`, a different model. Every unit was sent in a request of its own, as it is after seeding. Control run on `glm` as the translator with `deepseek` as the judge.

`extra words` is the number of words changed in the translation beyond the number of words changed in the source (0 is the ideal); `edit applied` is the share of units where the judge saw the source edit reflected; `consistency` is the judge's score for keeping the wording of the unchanged part.

| Request                                       | extra words, median | extra words, real edits | edit applied | consistency | accuracy |
| --------------------------------------------- | ------------------- | ----------------------- | ------------ | ----------- | -------- |
| as today                                      | 9                   | 25.6                    | 92%          | 74          | 90.8     |
| previous source and translation               | 0                   | 1.3                     | 84%          | 96          | 93.8     |
| previous source, translation and word changes | 0                   | 1.5                     | 95%          | 99          | 97.7     |
| heading path of the unit                      | 9                   | 20.9                    | 89%          | 73          | 88.5     |
| whole source page as reference                | 10                  | 26.9                    | 84%          | 70          | 86.2     |
| neighbouring units with their translations    | 10                  | 33.3                    | 84%          | 70          | 84.2     |

Conclusions that carry the design:

1. **The previous translation alone makes the model stick to it.** Five units came back unchanged although the source had changed (a removed anchor, a removed sentence, a changed number). Listing the changes explicitly fixes this: the edit is applied in 95% of the units against 92% today, with the wording of the rest kept.
2. **Other context hurts.** Neighbouring units and the whole page confuse the model about what to translate: accuracy drops to 84-86, markup errors and terminology violations grow. Heading paths change nothing.
3. **The effect is stable.** On `glm` the same request gives the same drop in extra words (median 9 -> 0) at equal accuracy. Two runs of the same request give identical output for 34 units of 37 against 25 of 37 today. Cost: about 250 tokens per request, 2% of a production request.

## Non-goals

- **Context beyond the previous version of the unit.** Neighbours, page text and heading paths were measured and rejected.
- **Changing how the seed pairs units.** Alignment (`alignTranslationUnits`) and the dictionary stay as they are; the feature only reads what the seed already recorded.
- **Units without a previous version.** A new sentence, a unit the seed never paired and a unit rewritten beyond recognition are translated exactly as today.

## Design

### 1. The per-file seed memory keeps the source text

`SeedStore` (`src/commands/translate/providers/ai/utils/cache.ts`) keeps the pairs of every file in document order as `[hash(source), translation]`. The hash is enough to serve unchanged units, but a changed unit has to be compared with the previous sources, so the per-file memory now stores `[source, translation]`. The dictionary stays keyed by hash. `SEED_VERSION` becomes 3: a seed file of the previous format is ignored, exactly as an older version is today, and every seeding run rebuilds the file anyway.

`TranslationStore.resolve()` matches units to the sequence by text instead of by hash; its behaviour does not change.

### 2. `TranslationStore.hints()` finds the previous version of a changed unit

```ts
export type SeedHint = {source: string; translation: string};
hints(file: string, texts: string[]): (SeedHint | undefined)[]
```

The entries of the per-file memory that `resolve()` did not use are the units the file no longer contains: the removed and the edited ones. For every unit `resolve()` left without a translation, the closest unused entry is its previous version, where closeness is the Dice coefficient over the word bags of the two source texts (words are whitespace-separated tokens of the unit text without its XLIFF wrapper). A hint needs a coefficient of at least 0.6; below that the unit is treated as new. Units are processed in document order and every entry is used at most once, so two edited sentences do not share one previous version.

Files without a memory, units served by the seed or the cache, and units without a close enough entry get no hint.

### 3. Word-level changes

`src/commands/translate/providers/ai/utils/diff.ts` (new) exports `wordChanges(before, after): string[]`: the longest common subsequence of the two word lists (`lcs()` from `align.ts`) leaves gaps, and every gap becomes one line - `replaced "a b" with "c"`, `removed "x"`, `inserted "y"`. Runs longer than 12 words on a side are cut to their first 12 words followed by `...`, so a large edit does not double the request.

### 4. The prompt

`buildMessages()` in `prompts.ts` takes `hints?: (SeedHint | undefined)[]`, parallel to the fragments, and renders a `{{memory}}` variable:

```
Translation memory. Some of the fragments below are edited versions of sentences that already have a translation. For each of them the previous source, its existing translation and the changes made in the source are listed. Fragments are numbered in the order they appear below. Apply exactly the listed changes to the existing translation: keep the wording of everything unchanged verbatim and translate only the changed parts. Do not keep anything that was removed from the source.

Fragment 2:
Previous source:
...
Existing translation:
...
Changes in the source: replaced "колонкам" with "колонки"
```

The default user prompt places `{{memory}}` between `{{context}}` and `{{fragments}}` - the order measured. A custom `--user-prompt` places `{{memory}}` where it wants; when a custom prompt does not mention it and there are hints, the memory is put right before the fragments (`{{fragments}}` or `{{text}}`), so an existing custom prompt gets the feature without an edit. Without hints the variable is empty and the request is byte-identical to today's.

Hints are per request and do not enter the cache fingerprint: a translation made with a hint is a translation of the unit text and is stored under it like any other. The default user prompt itself is part of the fingerprint, so the release resets the translation caches once; seeds are not affected.

### 5. Threading through the provider

`makeTranslator()` in `provider.ts` computes `store.lookup(path, texts)` once per file (translations and hints in one pass; with hints off only `store.resolve()`), and keeps the hint of every unit it buffers for the model in an array parallel to the batch. `translateBatch()`, `translateWithSplit()`, `retryFragments()`, `repairDamaged()` and `retryUntranslated()` take the hints of their fragments as one more parameter, so a retry of a fragment resends the same memory as the first attempt (the untranslated retry must resend the same prompt by design, see the 2026-09-16 spec). A batch split one-by-one splits the hints with it. The memory entry of a unit counts towards `maxBatchTokens` together with the unit, so the budget keeps bounding the request; the oversize check stays on the unit alone, and a unit that fits by itself is sent with its memory even when the pair is larger than the budget.

`TargetStat.memoryHints` counts the units sent with a hint; the stat line prints `memory-hints: N` when the count is non-zero and the run report exposes it as `cache.hints`.

### 6. Configuration

Config key `memoryHints` (boolean, default `true`) and the flag `--no-memory-hints` turn the feature off for a run, so a consumer can compare translations with and without hints on its own corpus. Nothing else is configurable: the threshold and the prompt wording are the measured ones.

## Testing

- `diff.spec.ts`: replaced, removed and inserted runs; a run cut at 12 words; identical texts give no changes.
- `cache.spec.ts`: the seed file stores the source text and is rebuilt from version 2; `hints()` returns the closest unused entry, ignores entries used by `resolve()`, applies the threshold, uses an entry once, returns nothing for files without a memory.
- `prompts.spec.ts`: the memory block lists only hinted fragments with their numbers, the default and a custom prompt place it before the fragments, `{{memory}}` in a custom prompt is honoured, no hints leave the user message unchanged.
- `provider.spec.ts`: with a seeded file the changed unit's request carries the memory block and the unchanged unit is served from the seed; the retry of an untranslated fragment carries the same block; `memoryHints: false` sends no block; the stat counts hinted units.
- Documentation: `docs/translate-seed.md` gets a section on changed sentences, `docs/translate-run-report.md` the new counter.
