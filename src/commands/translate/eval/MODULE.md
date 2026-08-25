# Translation eval harness

Measures translation quality of `yfm translate` on a fixed corpus
(`tests/eval/corpus`) and produces a scorecard. User documentation:
[docs/translate-eval.md](../../../../docs/translate-eval.md). Entry
point: `npm run translate:eval` -> `scripts/translate-eval.mjs`, which
bundles `cli.ts` with esbuild and runs it.

## Design constraints

The harness is built strictly on top of the public CLI surface: it
spawns `yfm translate` and talks to it through the documented
`--api-base` OpenAI-compatible endpoint. It never imports translate
runtime internals - only the prompt/judge helpers needed to stay in
sync with the request format, each covered by a drift-guard test in
`mock.spec.ts`.

## Module map

- `cli.ts` - orchestrator: arg parsing, CLI spawns, checks, report.
- `mock.ts` - pure request/response logic of the mock provider.
- `server.ts` - local OpenAI-compatible endpoints (capture and mock).
- `corpus.ts` - corpus enumeration and glossary loading.
- `markdown.ts` - shared prose/fence scanner.
- `markup.ts`, `glossary.ts`, `segments.ts`, `similarity.ts` -
  deterministic checks.
- `report.ts` - thresholds, verdict, human rendering.
- `types.ts` - public types of the report.

## Non-obvious decisions

- **Translation memory is built by two capture runs, not by
  `yfm translate seed`.** Inline element ids in extracted units
  (`<x id="x-12"/>`) come from a process-global counter, so the same
  unit hashes differently in different runs and the seed store (keyed
  by sha256 of the exact unit text) misses under concurrency. The
  capture runs record the exact units of both corpus sides through a
  local echo endpoint (`--user-prompt '{{context}}\n{{fragments}}'`,
  `--max-concurrency 1` for deterministic order), and the TM is keyed
  by id-normalized unit text instead. Compose ignores ids entirely
  (only `ctype`/`equiv-text`/`x-begin`/`x-end` matter), so serving
  units captured in another process is safe.
- **`yfm translate extract` output cannot feed the TM values**: the
  extract command produces non-compact XLIFF (`<g>` elements), and
  compose of a translate-flavoured skeleton with `<g>`-flavoured units
  duplicates inline markup (observed: doubled link tails).
- **Unit deduplication couples files.** The provider caches units per
  run, so a unit repeated across files (e.g. a toc name equal to a
  page H1) is requested only once. Both corpus sides must deduplicate
  identically, which is why `en/toc.yaml` names must match the en page
  titles exactly where the ru ones do (see `tests/eval/README.md`).
- **A first batch fragment arrives glued to the prompt preamble.**
  The lookup retries line-start suffixes; miss echoes strip the
  preamble to avoid smuggling the separator (quoted in the default
  prompt instruction) back into the response, which would break the
  fragment count.
- **The live `{% file %}` directive is excluded from the corpus**: its
  translate round-trip is lossy upstream (`@diplodoc/translation`
  compose mangles it, reproduced on `syntax/links.md`), and the same
  mangled artifact is visible in the published en docs. A fenced
  example of the directive stays in the corpus.
