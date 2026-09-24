# Translate model benchmark - design

**Date:** 2026-09-11
**Status:** approved for implementation
**Package:** `@diplodoc/cli`

## Goal

Rank translation model candidates against each other on a fixed corpus, repeatably. The question the benchmark answers is "should we move `yfm translate` from model X to model Y", and the answer must be a number with a known error bar, not an impression from reading a few pages.

One run produces a table with a row per candidate: deterministic quality violations, absolute judge score, pairwise win rate against the baseline model, and the price of the run (tokens, requests, wall time).

## Non-goals

- **Replacing the eval harness.** `npm run translate:eval` stays what it is: a binary PASS/FAIL gate on a single configuration, suitable for CI. The benchmark is a separate tool with a different output (a ranking, not a verdict).
- **All-pairs comparison.** Every candidate is judged against one baseline, not against every other candidate.
- **Prompt search.** The benchmark compares configurations that a human wrote down; it does not generate or tune them.
- **Run history.** Results are files. Collecting them over time belongs to the `translate-runs` pipeline (DOCSTOOLS-6597), not here.
- **Choosing the model automatically.** The output informs a human decision.

## Context

The eval harness (`src/commands/translate/eval/`, `docs/translate-eval.md`) already does most of the measuring:

- a fixed ru->en corpus in `tests/eval/corpus` with unit-aligned reference translations and a glossary;
- deterministic checks - markup preservation, glossary adherence, untranslated segments, token-F1 similarity to the reference;
- the LLM judge of `yfm translate --judge`, folded into a scorecard;
- a mock provider that serves the reference translations over a local OpenAI-compatible endpoint, so the whole pipeline runs offline;
- real mode: `--real --provider ... --model ... --api-base ...` passes provider flags through to `yfm translate`.

Three existing mechanisms carry the new design:

1. **Unit capture.** `captureUnits()` runs the corpus through `yfm translate` against a local echo endpoint with `--user-prompt '{{context}}\n{{fragments}}'` and `--max-concurrency 1`, recovering the exact translation units per file in document order. The harness already uses it twice per mock run (source side and reference side) to build the translation memory. The same call, pointed at a candidate's output directory, recovers that candidate's units - which is what makes segment-level comparison between candidates possible without proxying provider traffic.
2. **Positional pairing.** `buildTranslationMemory()` pairs two unit lists per file and reports files whose unit counts differ (`mismatched`). The benchmark needs the same pairing over three lists (source, baseline, candidate) and the same mismatch signal.
3. **Run report.** `yfm translate --report <path>` (`docs/translate-run-report.md`, `schemaVersion: 1`) writes timings, token counts, request and retry counts, fallback usage and errors. That is the cost side of the table, for free.

Constraints inherited from the harness and from `AGENTS.md`:

- The harness talks to the CLI only through its public surface: it spawns `yfm translate` and serves local OpenAI-compatible endpoints. It does not import translate runtime internals. The benchmark keeps this boundary.
- `tests/` ships in the npm package, `src/` and `scripts/` do not. A spec under `tests/` must not depend on them, or it must be excluded from the package with a `!`-pattern in `files` - this is exactly how the translate eval e2e broke the internal release cron in August (PR 2234).

## Design

### Candidate configuration

A YAML file, path given by `--candidates <path>`. It is the artifact that makes two runs comparable, so it is explicit and self-contained:

```yaml
baseline: current

judge:
  model: <strong model id>
  apiBase: https://.../v1
  authEnv: BENCH_JUDGE_KEY

candidates:
  - name: current
    provider: openai
    model: <production model id>
    apiBase: https://.../v1
    authEnv: BENCH_OPENAI_KEY
  - name: glm
    provider: openai
    model: <glm model id>
    apiBase: https://.../v1
    authEnv: BENCH_GLM_KEY
    apiHeaders:
      - 'X-Gateway-Tenant: docs'
    systemPrompt: ./prompts/glm-system.txt   # optional, per candidate
```

Rules:

- Credentials are named, never inlined: `authEnv` holds the name of an environment variable, and the benchmark fails fast with the missing variable name if it is unset. No secrets in the repo, none in the report.
- `baseline` must name one of the candidates. It is the side every pairwise comparison is measured against.
- `provider`, `model`, `apiBase`, `apiHeaders`, `folder`, `systemPrompt`, `userPrompt` map one to one onto the corresponding `yfm translate` flags. Candidates may use any provider the CLI supports.
- `judge` is a single configuration shared by all comparisons. A judge that changes between candidates would make win rates incomparable. The pairwise judge speaks the OpenAI chat-completions protocol only (see Limitations).

### The run matrix

For each candidate, for each repeat `1..R` (`--repeats`, default 1), the benchmark performs one full eval run in real mode, sequentially. Sequential on purpose: candidates usually share a gateway, and concurrent runs would distort the latency numbers and trip rate limits.

Every run gets its own workdir `<workdir>/<candidate>/<repeat>/` holding the translated output, the eval JSON report, the translate run report and the captured units - so any number in the table can be traced back to files.

Two flags are forced on every translate invocation, regardless of the candidate config:

- `--no-cache`. The persistent translation cache is opt-in (`--cache-dir`), but a `.yfm` config next to the corpus can switch it on, and then repeat 2 would be served from repeat 1's cache and the measured spread would be a fiction. The benchmark does not leave that to chance;
- `--report <path>`, to collect cost and latency.

`--dry-run` prints the planned matrix (candidates, repeats, corpus size, which env variables will be read) and exits without calling any provider. Running a benchmark costs real money; the plan should be inspectable before it is paid for.

### Segment alignment

After each run the benchmark captures the units of that run's output directory with the existing capture mechanism (`captureUnits` against `<workdir>/out`, source language = the target language of the run). Source-side units are captured once per benchmark and reused: the corpus does not change between candidates.

Alignment is positional per file, as in the translation memory. For every file the benchmark holds three lists - source, baseline output, candidate output - and pairs them by index. A file is aligned only when all three lists have the same length.

Files whose unit counts diverge are **excluded from pairwise judging and counted as a structural mismatch for the candidate whose list diverges from the source**. A model that merges or drops paragraphs cannot be compared segment by segment, and that it does so is itself a quality finding, reported in its own column rather than hidden.

### External corpus

`--corpus` already accepts any directory in the corpus layout, but the eval harness asserts that **every** source page has a reference translation (`listCorpusPages`), because its similarity and untranslated-lines checks read the reference side. Choosing a model for documentation that has not been translated yet is precisely the case where that assertion bites.

So `listCorpusPages` gains a `requireReference` option, and `evaluatePages` tolerates an absent reference page: similarity and untranslated lines are reported as unavailable for that page instead of failing the run. The eval CLI keeps requiring references (unchanged behavior, unchanged gate); the benchmark passes `requireReference: false`.

What survives on a reference-less corpus: markup preservation, glossary adherence, the absolute judge, cost and latency, and the whole pairwise comparison - which needs only the source and the two candidate outputs. The report records which metrics were available, and the table renders the unavailable ones as `-` rather than as zeros that look like perfect scores.

### Pairwise judging

For each aligned triple (source unit, baseline translation, candidate translation):

- Triples where both translations are identical after unit-id normalization are recorded as `identical` and never sent to the judge. On close models this is a large share of the corpus and the main cost saving.
- Identical triples across files are deduplicated, as the translate provider already deduplicates repeated units.
- Which translation is presented as "A" is decided by a seeded hash of the unit text (`--seed`, default fixed), not by candidate order. Judges have a well-known position bias; without this, the win rate measures which side got printed first. The choice is reproducible, so a rerun with the same seed judges the same layout.
- Units are batched into one request, as the existing judge does, and verdicts are parsed back by index.

The judge returns, per unit, a winner (`A`, `B`, `tie`), a category (`accuracy`, `terminology`, `style`, `markup`) and a one-line reason. Categories are what turns "glm wins 58%" into something actionable: winning on style while losing on terminology is a different decision than the reverse.

Aggregation per candidate: wins, losses, ties, `winRate = (wins + ties / 2) / judged`, and a breakdown of wins and losses by category. The report keeps a bounded sample of verdicts with their reasons for eyeballing.

### Repeats, spread and significance

With `R > 1` every deterministic metric is reported as mean with min and max across repeats.

Pairwise verdicts from all repeats are pooled. A two-sided binomial sign test over wins versus losses (ties dropped) marks the comparison `significant` at p < 0.05, `inconclusive` otherwise. Deterministic metrics whose difference from the baseline falls inside the observed spread are marked the same way.

This is deliberately a small, testable amount of statistics. The point is not a publishable p-value; it is to stop a 51% win rate on 40 segments from being read as "glm is better".

### Output

Markdown table on stdout, ready to paste into a ticket or a chat:

| candidate | markup | glossary | untranslated | similarity | judge | vs base (W/L/T) | win rate | tokens in/out | time |
| --------- | ------ | -------- | ------------ | ---------- | ----- | --------------- | -------- | ------------- | ---- |

plus `bench-report.json` with the full structure: per candidate, per repeat, the eval report, the run report, structural mismatches, pairwise verdict counts by category, every verdict with the texts it judged, the aggregates and the significance marks. `schemaVersion` on the top level, same contract discipline as the run report.

And `bench-report.html` next to it - the artifact for actually looking at the comparison. A number like "wins 62%" is a claim; the HTML is where it can be checked. It holds the same summary table, the category breakdown per candidate, and then the segment list: source, baseline translation and candidate translation side by side, the winner highlighted, the judge's reason next to it, sorted so losses and wins come before ties. Single self-contained file - inline CSS, no external assets, no build step, no network - so it can be opened from a temp directory or attached to a ticket as is. Translation text is HTML-escaped: the corpus is full of `<`, `&` and raw markup, and an unescaped report would both break the layout and misrepresent what the model produced.

The HTML is rendered from the JSON report and nothing else, so the renderer stays a pure function and a report can be re-rendered later.

The process exits non-zero only when the benchmark itself failed (a run crashed, credentials missing, alignment impossible for every file). A candidate losing is a result, not an error.

### Module map

New module `src/commands/translate/bench/`, with a `MODULE.md` as the repo requires:

- `cli.ts` - argument parsing and orchestration;
- `candidates.ts` - config loading, validation, environment resolution;
- `align.ts` - three-way positional alignment of captured unit lists, mismatch reporting;
- `pairwise.ts` - triple selection, dedup, seeded side assignment, prompt construction, verdict parsing;
- `chat.ts` - minimal OpenAI-compatible chat client for the judge (fetch, retry, concurrency limit);
- `aggregate.ts` - aggregation over repeats, spread, sign test;
- `report.ts` - JSON shape and table rendering;
- unit specs co-located as `*.spec.ts`.

Everything except `cli.ts` and `chat.ts` is pure: lists in, numbers out. That is what makes the benchmark testable without a network.

Supporting changes:

- **`eval/run.ts` (extraction).** `eval/cli.ts` is 620 lines and currently owns argument parsing, process orchestration, checks and reporting at once. The single-run orchestration moves into `runEval(options): Promise<EvalRunResult>` returning the report and the artifact paths; `eval/cli.ts` keeps argument parsing and the exit code. The benchmark calls `runEval` instead of duplicating spawn logic. No behavior change, covered by the existing eval specs and e2e.
- `scripts/translate-bench.mjs`, mirroring `scripts/translate-eval.mjs` (esbuild bundle of `bench/cli.ts`), wired as `npm run translate:bench`.
- `docs/translate-bench.md` - user documentation.
- `bench/candidates.example.yaml` - a committed example config with placeholder model ids and env names.

## Testing

- Unit specs for the pure modules: alignment including the mismatch path, triple selection and dedup, seeded side assignment (same seed gives the same layout, both sides get roughly half the first positions), verdict parsing including malformed judge output, aggregation over repeats, the sign test against hand-computed values, table rendering.
- One orchestration spec driving `bench/cli.ts` with `runEval` and the chat client stubbed: two synthetic candidates, two repeats, asserting the matrix, the forced flags (`--no-cache`, `--report`) and the report shape.
- A drift guard in the spirit of `mock.spec.ts`: the judge prompt builder and its parser are tested against each other, so a prompt edit that breaks parsing fails the suite.
- No new spec under `tests/`. The benchmark needs `src/` and `scripts/`, which are not shipped in the npm package; putting its e2e there would repeat the August breakage. If an e2e is added later it must carry a `!`-pattern in `files`, per `AGENTS.md`.

## Limitations

- **The pairwise judge is OpenAI-compatible only.** Candidates can use any provider supported by `yfm translate`, since translation goes through the CLI, but the judge talks chat-completions. Adding Anthropic or YandexGPT judging means a second client and is out of scope.
- **The default corpus is ru->en public Diplodoc documentation.** Any other corpus is opt-in through `--corpus`, and on a corpus without reference translations the similarity and untranslated-lines metrics are simply unavailable (see External corpus). Growing the default corpus, or adding language pairs to it, is separate work.
- **A win rate is corpus-specific.** It says a model is better on this corpus, at this prompt, at this temperature. Rerunning after the prompt changes is part of the workflow, not an exception to it.
- **Cost scales with the matrix.** Candidates x repeats full translations, plus one judge request batch per non-identical segment pair. `--dry-run` exists so this is a decision, not a surprise.
