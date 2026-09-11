# Translation model benchmark

The benchmark answers one question: should `yfm translate` move from
model X to model Y. It runs the eval corpus through every candidate,
compares each candidate against a baseline segment by segment with a
pairwise judge, and prints one table with quality, cost and latency.

It is a different tool from [the eval harness](translate-eval.md).
The eval is a binary gate on a single configuration, suitable for CI.
The benchmark is a ranking: it never fails a build, it tells you which
model is better and by how much.

## Quick start

Always look at the plan first - a benchmark run costs real money:

```bash
npm run translate:bench -- --candidates bench/candidates.yaml --dry-run
```

```
Plan: 6 translate run(s) over 20 page(s)
  baseline: current
  current: openai gpt-4o-mini x 3
  glm: openai glm-4.6 x 3
  pairwise judge: gpt-4o
  environment variables: BENCH_CURRENT_KEY, BENCH_GLM_KEY, BENCH_JUDGE_KEY
```

Then run it:

```bash
npm run translate:bench -- --candidates bench/candidates.yaml --repeats 3
```

The run prints a scorecard and writes two reports (paths are printed at
the end): `bench-report.json` with everything, and `bench-report.html`
to look at the comparison with your own eyes.

## Configuration

Candidates live in a YAML file (see `bench/candidates.example.yaml`).
The file is the artifact that makes two benchmark runs comparable, so
everything that affects the result belongs in it:

```yaml
baseline: current

judge:
  model: gpt-4o
  apiBase: https://gateway.example/v1
  authEnv: BENCH_JUDGE_KEY
  batchSize: 10

candidates:
  - name: current
    provider: openai
    model: gpt-4o-mini
    apiBase: https://gateway.example/v1
    authEnv: BENCH_CURRENT_KEY

  - name: glm
    provider: openai
    model: glm-4.6
    apiBase: https://gateway.example/v1
    authEnv: BENCH_GLM_KEY
    apiHeaders:
      - 'X-Gateway-Tenant: docs'
```

| Field                        | Where     | Meaning                                                      |
| ---------------------------- | --------- | ------------------------------------------------------------ |
| `baseline`                   | top level | Candidate every comparison is measured against. Required.    |
| `name`                       | candidate | Short name for the table and the workdir. Required, unique.  |
| `provider`                   | candidate | `openai`, `anthropic`, `yandexgpt`, `openrouter`, `yandex`.  |
| `model`                      | candidate | Model identifier passed to `--model`.                        |
| `apiBase`                    | candidate | Endpoint passed to `--api-base`.                             |
| `apiHeaders`                 | candidate | Extra headers, `"Name: value"`, passed to `--api-header`.    |
| `folder`                     | candidate | Yandex AI Studio folder id.                                  |
| `systemPrompt`, `userPrompt` | candidate | Prompt overrides, literal text or a path.                    |
| `authEnv`                    | candidate | **Name** of the environment variable with the key.           |
| `judge.model`                | judge     | Model that decides the pairwise verdicts. Required to judge. |
| `judge.apiBase`              | judge     | OpenAI-compatible endpoint of the judge.                     |
| `judge.authEnv`              | judge     | Name of the environment variable with the judge key.         |
| `judge.batchSize`            | judge     | Units per judge request, default 10.                         |

Keys are never written in the config: `authEnv` holds the variable
name, and the run fails before the first request if a variable is
unset, naming all the missing ones at once.

## How the comparison works

1. **Translate.** Each candidate translates the corpus through the real
   `yfm translate` pipeline, once per repeat. Every run gets its own
   workdir with the output, the eval report and the translate run
   report. `--no-cache` and `--report` are forced on every run: a cache
   hit would make a repeat free and the measured spread a fiction.
2. **Capture the units.** The translation units of the source corpus
   and of every candidate output are recovered through the harness
   capture mechanism - one sequential translate run against a local echo
   endpoint. No provider traffic is proxied.
3. **Align.** Units are paired positionally per page. A page counts only
   when the source and both outputs produced the same number of units;
   a model that merged or dropped a paragraph cannot be compared segment
   by segment, so the page is excluded and counted in the `struct`
   column.
4. **Judge.** Pairs whose two translations coincide are never sent to
   the judge - on close models that is most of the corpus and the main
   cost saving. The rest go to the judge in batches, with the source and
   both variants. Which variant is shown first comes from a seeded hash
   of the unit, not from the candidate order: judges have a position
   bias, and without shuffling the win rate would partly measure who got
   printed first. The same `--seed` reproduces the same layout.
5. **Aggregate.** Verdicts from all repeats are pooled into wins,
   losses and ties; the win rate counts a tie as half. A two-sided sign
   test over wins and losses marks the result significant at p < 0.05 -
   otherwise the table says `inconclusive`, which is the honest reading
   of a 51% win rate on 40 segments.

## Reading the output

```
candidate           markup  glossary  untransl  similarity  judge  struct  W/L/T      win rate  tokens in  tokens out  time
current (baseline)  0.0     0.0       0.0       0.824       91.3   0.0     -          -         120,400    98,300      61.2s
glm                 0.0     0.0       1.0       0.802       93.1   0.0     70/40/10   62.5%     131,900    104,100     74.8s
```

- **markup, glossary, untransl, struct** - violations, lower is better.
  With `--repeats` above 1 the spread is printed next to the mean.
- **similarity** - token F1 against the reference translation. A trend
  metric: a different phrasing is not a worse one.
- **judge** - the absolute per-segment score of `yfm translate --judge`.
- **W/L/T and win rate** - the pairwise comparison against the baseline.
- **tokens, time** - the price of the run, from the translate run
  report.

A `-` means the metric could not be measured, not zero.

The HTML report holds the same table plus every judged segment: source,
both translations side by side, the winner highlighted and the judge's
reason. Decided verdicts come before ties. It is a single file with
inline styles and no scripts, so it opens from a temp directory and can
be attached to a ticket as is.

The JSON report carries `schemaVersion`, the per-repeat artifact paths,
every metric, all verdicts with their texts and the significance marks.

The process exits non-zero only when the benchmark itself failed. A
candidate losing is a result, not an error.

## Corpus

By default the benchmark runs the eval corpus (`tests/eval/corpus`,
ru -> en). `--corpus` accepts any directory in the same layout.

A corpus without reference translations works: similarity and
untranslated lines become unavailable, while markup, glossary, the
absolute judge, cost and the entire pairwise comparison still work -
the comparison needs only the source and the two outputs. This is the
usual case when choosing a model for documentation that has not been
translated yet.

## Cost control

- Identical pairs are never judged.
- `--max-pairs <n>` caps how many pairs go to the judge per candidate.
- `--no-pairwise` skips judging entirely and leaves the deterministic
  metrics and the cost table.
- `--repeats` multiplies everything: it buys an error bar, so use it
  when a decision hangs on a small difference.

## Options

| Option                | Default                       | Meaning                                              |
| --------------------- | ----------------------------- | ---------------------------------------------------- |
| `--candidates <path>` | -                             | Candidate config. Required.                          |
| `--corpus <dir>`      | `tests/eval/corpus`           | Corpus location.                                     |
| `--cli <path>`        | `build/index.js`              | CLI binary under test.                               |
| `--workdir <dir>`     | temp dir                      | Working directory with all run artifacts.            |
| `--report <path>`     | `<workdir>/bench-report.json` | JSON report path.                                    |
| `--html <path>`       | `<workdir>/bench-report.html` | HTML report path.                                    |
| `--source`/`--target` | `ru-RU` / `en-US`             | Language pair.                                       |
| `--repeats <n>`       | 1                             | Runs per candidate; above 1 adds spread and pooling. |
| `--seed <value>`      | `default`                     | Seed of the A/B side assignment.                     |
| `--max-pairs <n>`     | -                             | Cap on judged pairs per candidate.                   |
| `--no-pairwise`       | judging on                    | Skip the pairwise judge.                             |
| `--no-judge`          | judge on                      | Skip the absolute judge of `yfm translate`.          |
| `--dry-run`           | off                           | Print the plan and exit without calling a provider.  |

## Limitations

- **The pairwise judge speaks OpenAI chat completions only.** Candidates
  may use any provider the CLI supports, since translation goes through
  the CLI; the judge does not.
- **A win rate is corpus-specific.** It says a model is better on this
  corpus, with these prompts, at this temperature. Rerun after the
  prompts change.
- **Runs are sequential.** Candidates usually share a gateway, and
  concurrent runs would distort the latency numbers and trip rate
  limits.
