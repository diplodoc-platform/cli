# Translation model benchmark

Ranks translation model candidates on a fixed corpus: deterministic
quality checks, a pairwise judge against a baseline model, and the cost
of each run. User documentation:
[docs/translate-bench.md](../../../../docs/translate-bench.md). Entry
point: `npm run translate:bench` -> `scripts/translate-bench.mjs`, which
bundles `cli.ts` with esbuild and runs it.

## Design constraints

The benchmark drives the CLI from the outside, exactly like the eval
harness: every translation goes through `runEval` (see `../eval/run.ts`),
which spawns `yfm translate`. The only component that talks to a model
directly is the pairwise judge, because there is no CLI surface for
"compare these two translations".

The eval harness stays a binary PASS/FAIL gate on one configuration.
The benchmark produces a ranking and never fails a build on a losing
candidate.

## Module map

- `cli.ts` - argument parsing and orchestration of the run matrix.
- `candidates.ts` - config loading, validation, environment resolution.
- `align.ts` - three-way positional alignment of captured units.
- `pairwise.ts` - pair selection, prompt, verdict parsing.
- `chat.ts` - minimal OpenAI-compatible client for the judge.
- `aggregate.ts` - repeats, spread, sign test.
- `report.ts` - JSON shape and the terminal scorecard.
- `html.ts` - self-contained HTML report.
- `types.ts` - config and verdict types.

Everything except `cli.ts` and `chat.ts` is pure, which is what makes
the benchmark testable without a network; `smoke.spec.ts` drives the
whole orchestrator with `runEval`, `captureUnits` and `fetch` stubbed.

## Non-obvious decisions

- **Candidate units are captured from the output tree, not proxied.**
  Comparing candidates segment by segment needs their translations as
  translation units. Instead of putting a recording proxy in front of
  every provider, the benchmark reuses the harness capture run (an echo
  endpoint plus `CAPTURE_USER_PROMPT`) on each candidate's `out/`. Same
  segmenter, same traversal order, so the units line up with the source.
  Source-side units are captured once and shared.
- **A page is comparable only when all three unit lists have the same
  length.** Divergence means the model merged or dropped something, so
  segment pairing would silently compare unrelated texts. Such pages are
  excluded and counted as structural mismatches, which is itself a
  quality signal.
- **Identical pairs never reach the judge.** On close models most units
  come out the same; judging them would burn the budget on foregone
  conclusions.
- **The A/B side comes from a seeded hash of the unit text.** Judges are
  biased toward one position; without shuffling the win rate would
  partly measure print order. Seeding keeps reruns comparable.
- **`--no-cache` and `--report` are forced on every translate run.** The
  cache would make repeat 2 free and the spread meaningless; the run
  report is where tokens, duration and errors come from.
- **A metric is reported only when every repeat produced it.** Averaging
  over the subset of repeats that happened to report tokens would
  compare different things between candidates.
- **Every judge verdict keeps the three texts it compared.** They are
  what the HTML report renders; without them the report could only
  restate the numbers.
- **The judge is OpenAI-compatible only.** Candidates may use any
  provider the CLI supports, since translation goes through the CLI.
  Adding a second judge protocol needs a second client and has not been
  worth it.
