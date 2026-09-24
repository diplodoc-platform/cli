# Untranslated units: glossary placement and identity retry - design

**Date:** 2026-09-16
**Status:** approved for implementation
**Package:** `@diplodoc/cli`

## Goal

Remove the dominant failure mode of `yfm translate`: a unit that comes back from the model verbatim, in the source language, and ships into the translated page as russian text.

Baseline for the fix, measured with the eval harness against Eliza `deepseek-v4-flash` (ru->en corpus, 16 pages, 500 units, default thresholds): **7 runs out of 8 failed**, and every glossary violation in the series was a consequence of an untranslated unit, not an independent defect. The worst case shipped a whole page (`syntax/links.md`, 32 lines) in russian.

The target state: the same series is green, and a unit that is still returned verbatim is a rare event that the run report counts.

## Non-goals

- **Gate thresholds and where the eval runs.** What counts as a passing run and whether the eval gates the tasklet pipeline is decided after the re-measurement, on a healthy engine.
- **Retrying through the fallback model.** `--fallback-model` stays what it is: a reaction to a failing or rate-limited endpoint, not to a bad answer from a working one.
- **Judge changes.** The judge does not see identity units by design (`makeJudgeCollector`: "identity output is a miss, not a translation"), and this design keeps it that way.
- **New configuration.** No new flags, no new config keys. Both changes are unconditional behaviour of the default prompt path.

## Measurements

Every row below is 15 to 20 independent `yfm translate` runs of CLI 5.59.0 against `https://api.eliza.yandex.net/raw/internal/deepseek-v4-flash/v1`, `--temperature 0 --no-cache`, counting how often the unit came back byte-identical to the source.

| Request                                                 | Fragment                      | Returned verbatim |
| ------------------------------------------------------- | ----------------------------- | ----------------- |
| no glossary                                             | `# О Diplodoc`                | 2 of 20           |
| glossary of 6 pairs in the user message                 | `# О Diplodoc`                | 20 of 20          |
| glossary of 1 pair in the user message                  | `# О Diplodoc`                | 15 of 15          |
| glossary of 6 pairs in the system prompt                | `# О Diplodoc`                | 0 of 15           |
| glossary of 6 pairs in the user message                 | a full sentence               | 1 of 15           |
| glossary of 6 pairs, whole `about.md`                   | `# О Diplodoc` among 13 units | 4 of 20           |
| no glossary, retry-style instruction in the user prompt | `# О Diplodoc`                | 15 of 20          |

Three conclusions carry the design:

1. **The glossary block is the trigger, not the model.** In `DEFAULT_USER_PROMPT` the rendered glossary (`Use these required term translations:\n- заметка → note\n...`) sits immediately before the fragments. A short fragment that follows a list of `source → target` pairs is read as another entry of that list and echoed back. Presence is what matters, not size: one pair is as bad as six. Long prose fragments are nearly immune, which is why headings, table cells and one-line includes were the pages that failed.
2. **Isolating a unit helps on its own.** The same heading fails 6 runs out of 8 inside the full corpus but 1 in 10 as a request of its own, so a retry that re-sends only the failing units is worth making even after the prompt fix.
3. **Telling the model not to echo makes it echo.** A retry prompt that says "the previous attempt returned these fragments unchanged" raised the verbatim rate from 2 of 20 to 15 of 20. The retry must re-send the same prompt, with no meta-instruction about the previous attempt.

## Design

### 1. The glossary moves to the system prompt

`buildMessages()` in `src/commands/translate/providers/ai/prompts.ts` already solves this exact problem for context files: they land in the system message because they are identical for every batch and play well with provider-side prompt caching, and a `{{contextFiles}}` placeholder in either template overrides the default placement. The glossary has the same properties and gets the same treatment:

- `{{glossary}}` is removed from `DEFAULT_USER_PROMPT`.
- When the rendered glossary is non-empty and neither the system nor the user template contains `{{glossary}}`, the placeholder is appended to the system template, exactly as `{{contextFiles}}` is today.
- `vars.glossary` stays, so a custom `--system-prompt` or `--user-prompt` that places `{{glossary}}` itself keeps full control.

Consequences to state in the PR description:

- **Translation caches reset.** `DEFAULT_SYSTEM_PROMPT` and `DEFAULT_USER_PROMPT` are part of the cache fingerprint (`provider.ts`, `cacheFingerprint`), so every consumer re-translates once after the upgrade. This is the established cost of any prompt change in this CLI, and it is the reason the change is worth batching with the retry below rather than shipping twice.
- **Behaviour changes for consumers with a custom user prompt** that does not mention `{{glossary}}`: their glossary moves from the user message to the system message. That is the desired default.

### 2. Retry of identity units

The CLI already has this shape for a neighbouring defect: `repairDamaged()` in `provider.ts` re-requests the fragments whose markup the repair could not save, through the generic `retryFragments()` helper, counts them in `stat.markupRetried` and keeps the source text for the ones the retry did not fix. Identity output gets a sibling of that function rather than a new mechanism:

- `retryUntranslated(path, fragments, parts, context)` runs next to `repairDamaged()` in the same post-processing chain, selects the fragments that came back equal to their source with source-script text still in them, and re-requests exactly those through `retryFragments()`. Same prompt, same document context, no meta-instruction about the previous attempt (see measurement 3).
- One retry attempt. A fragment the retry translates is stored and counted as translated; a fragment that comes back identical again keeps the current behaviour - warn, keep the source text, count it in `stat.untranslated`.
- Counters mirror the markup ones: `stat.untranslatedRetried` for the re-requested fragments, surfaced in the run report next to its neighbours as `fixes.untranslatedRetried`. `units.untranslated` keeps its present meaning and becomes the residual after the retry. The report gains one additive field; `schemaVersion` stays 1.
- The warning text of `retryFragments()` is currently hardcoded as "Markup retry failed"; it takes a label so both callers report themselves correctly.
- The retry sits between the model answer and `repairDamaged()`, so the markup repair sees the retried text and a fragment damaged by the retry keeps its source text through the existing path, counted in `fixes.markupDamaged` as before.
- Skipped in `dryRun`: a dry run returns the fragments themselves as the "translation" and would otherwise retry every unit and double the estimate.

### 3. Ordering and verification

The two changes ship in one PR: they touch the same failure mode, and the cache fingerprint resets once instead of twice.

Verification is the same series that produced the baseline: 8 eval runs against `deepseek-v4-flash` through Eliza, default thresholds, reported as a before/after table in the PR. The series is the acceptance criterion - a single green run proves nothing, because the failure was never deterministic per run.

## Testing

Unit tests (`vitest -c vitest.units.config.ts`):

- `prompts.spec.ts`: the glossary lands in the system message; a `{{glossary}}` placeholder in a custom system or user template keeps the glossary there and does not duplicate it; an empty glossary adds nothing.
- `provider.spec.ts`: a client that answers identity once and a translation on the second call stores the translation, leaves `units.untranslated` at zero and counts one `untranslatedRetried`; a client that answers identity twice keeps the source text, warns once and counts one untranslated unit; a unit that legitimately equals its source without source-script text (a bare identifier, a URL) is not retried; `dryRun` issues no retry.
- Existing cache tests cover the fingerprint reset; no new case needed.

Live verification, outside CI (needs Eliza credentials):

- `npm run translate:eval -- --real --provider openai --api-base <eliza>/raw/internal/deepseek-v4-flash/v1 --model deepseek-v4-flash --auth <token file>`, 8 runs, compared against the recorded baseline of 7 failures out of 8.

The mock-mode e2e (`tests/e2e/translate-eval.spec.ts`) keeps guarding the harness itself and is unaffected: the mock provider never returns identity output for a source-script unit.

## Limitations

- The measurements are one model (`deepseek-v4-flash`), one language pair and one corpus. The mechanism - a short fragment following a list of term pairs - is not model-specific, but the rates are.
- The retry is a probability reduction, not a guarantee. After both changes a unit can still come back verbatim; the run report is what makes that visible.
- Only the `--glossary` path was measured. Consumers of the neurotranslate tasklet pass their glossaries as `--context-file` sections, which already live in the system prompt and are not affected by change 1.
