# ADR-009: LLMS files (llms.txt / llms-full.txt)

## Status

Accepted

## Context

The [llmstxt.org](https://llmstxt.org) specification defines a convention for
providing documentation in a format optimized for Large Language Model (LLM)
consumption. Two files are generated per TOC:

1. **llms.txt** — a compact index with links to individual pages
2. **llms-full.txt** — the entire documentation concatenated as self-contained
   markdown

## Motivation

- Machine-readable access to documentation without HTML parsing
- LLMs can ingest the full documentation in a single file
- The artifacts must stay consistent with the built "version" — hidden pages
  and inactive `{% if %}` branches must not leak

## Decision

### Generation timing

LLMS files are generated in the `AfterAnyRun` hook, so they work for both `md`
and `html` builds. By that point the TOC is already resolved and filtered
(vars/conditions, `removeHiddenTocItems`/`removeEmptyTocItems`), which keeps the
artifacts consistent with the exact "version" produced by single-source
publishing.

Walking `run.toc.tocs` + `walkEntries` mirrors `SinglePage`.

### llms.txt (index)

A compact index following the llmstxt.org spec:

- Title (`# {toc.title}`)
- Optional description (`> {llms.description}`)
- `## Documentation` section with links to each page
- Footer linking to `llms-full.txt`

Links point to the actual output files: original href in `md`, rendered `.html`
in `html` builds.

### llms-full.txt (full text)

Assembled with `MarkdownCollector` (the same engine `OutputMd` uses) with
`SELF_CONTAINED` config — every include is merged into self-contained markdown
regardless of the build's output format (no md/html fork).

Leading (yaml) pages have no markdown body to inline; they still appear in the
index above.

### Configuration

```yaml
llms:
  enabled: true # or 'md' (only for md output)
  description: '...' # optional, shown in llms.txt header
  llmsFullMaxSize: 4M # max size of llms-full.txt (default 4M)
```

CLI: `--llms` (boolean), `--llms-full-max-size <value>` (default `4M`).

The `enabled` flag accepts `true`, `false`, or `'md'` (enable only for md
output). When the `--llms` CLI flag is explicitly passed, it overrides the
config value. When not passed, the config value is used; if no config section
exists, `md` output defaults to enabled and `html` to disabled.

### llmsFullMaxSize and YFM022

`llms-full.txt` can grow very large for big documentation sets. The
`llmsFullMaxSize` parameter (default `4M`) limits the file size:

- Size is checked **after each article** is added (not at the end)
- When the accumulated content would exceed the limit, article ingestion
  **stops** — remaining articles are skipped
- `YFM022` is logged as **info** (not error) — the build does not fail
- The file is still written with whatever content fit within the limit

This differs from `maxAssetSize` (YFM013), which logs an error but still copies
the file. Here the goal is to produce a useful (if truncated) file for LLM
consumption, not to block the build.

### Priority resolution

`llmsFullMaxSize` is resolved with priority: CLI flag → YAML config → default
(`4M`). The default is defined in a single constant
(`LLMS_FULL_MAX_SIZE_DEFAULT`) in `llms/config.ts`, and the resolution logic is
encapsulated in `resolveLlmsFullMaxSize()`.

The `fileSizeConverter` utility (shared with `maxAssetSize`, `maxHtmlSize`, etc.)
converts string values like `'4K'` or `'8M'` to bytes. The `disableIfZero`
option means `'0'` is treated as "use default", not "0 bytes" — consistent with
`maxAssetSize`.

## Consequences

- `llms-full.txt` may be truncated for large docs — this is intentional and
  logged as info, not an error
- The file always contains at least the title and whatever articles fit
- `0` means "use default" (not "no limit"), consistent with `maxAssetSize`
- The artifacts are consistent with the built version: hidden pages and
  inactive `{% if %}` branches do not leak into either file
