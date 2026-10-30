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
- The artifacts must stay consistent with the conditionally selected build
  "version", while applying a stricter exposure policy: hidden pages and
  inactive `{% if %}` branches must not leak

## Decision

### Generation timing

LLMS files are generated in the `AfterAnyRun` hook, so they work for both `md`
and `html` builds. By that point the TOC is already resolved and filtered
(vars/conditions and `removeEmptyTocItems`), which keeps the artifacts
consistent with the exact conditionally selected "version" produced by
single-source publishing.

Each TOC in `run.toc.tocs` is processed separately.

### Entry selection and hidden items

Before either file is rendered, the TOC is traversed depth-first to build one
shared list of documentation entries. The following rules apply:

- An item with `hidden: true` is not added to the entry list
- The descendants of an item with `hidden: true` are not traversed and are
  therefore excluded as well
- Hidden filtering is always applied, independently of the
  `removeHiddenTocItems` build option
- External links are not documentation entries and are ignored

The regular build can therefore keep and render hidden pages when
`removeHiddenTocItems` is disabled, while `llms.txt` and `llms-full.txt` never
expose them. Both files, as well as OpenAPI companion matching for the index,
use the same filtered entry list.

### llms.txt (index)

A compact index following the llmstxt.org spec:

- Title (`# {toc.title}`)
- Optional description (`> {llms.description}`)
- `## Documentation` section with links to each page
- Footer linking to `llms-full.txt`

Link labels prefer the article's `meta.title`, then its first H1, then the TOC
item name. The first H1 can be a Markdown heading or a raw HTML `<h1>` in
document order. Raw HTML headings and inline HTML are interpreted only when
`allowHtml` is enabled. Otherwise, HTML markup remains literal text, as in the
article renderer. In both Markdown and raw HTML headings, `<br>` separates
words, image alternative text is retained, entities are decoded, and whitespace
is collapsed. Content inside scripts, styles, and templates is excluded when
HTML is enabled. Headings inside code examples and, when HTML is enabled,
HTML comments, scripts, styles, and templates are ignored.
Markdown H1 text excludes YFM heading attributes (IDs, classes, and key/value
pairs) using the same attribute parser as the renderer; literal inline code
remains visible. The title parser also reuses the renderer's YFM monospace
(`##text##`) and superscript (`^text^`) plugins, so their formatting markers
do not appear in link labels. Raw HTML blocks still retain these markers as
literal text, matching the article renderer.
The H1 is selected from the assembled human document: includes
are resolved with their hash and `notitle` semantics, and agent-only visibility
blocks are excluded just as in static HTML and the canonical corpus.
Empty or whitespace-only titles are skipped. A leading YAML page's
`title` is its H1 equivalent. If none are available, the existing description
and href fallbacks remain. Titles and metadata are loaded through the source
services before rendering the index, including in worker builds, so Liquid
substitutions and conditions match the built documentation. Index entries retain TOC order. Entries without a prepared worker snapshot
are resolved sequentially because loading another article's includes can replace
shared page metadata. Prepared strings are independent of these later loads. Collectors are
scoped to one article in both human and agent corpora so a shared include retains
that article's variables. Human corpus collection also provides index titles;
only the extracted titles are retained for the index. Pages beyond the corpus
size limit still have their titles resolved, and a non-empty `meta.title` avoids
unnecessary include collection and H1 parsing for the index.
Markdown builds transfer a compact per-page title/description snapshot from the
worker that processed the page. The snapshot includes intentional front-matter
propagation from a sole include and is saved before another article is processed.
For a leading ATX H1 without links or attributes, only that heading is parsed. Otherwise, already merged Markdown is
reused when source-map comments are disabled and it has neither audience
directives nor embedded SVG; ambiguous and unmerged documents retain canonical human collection. The snapshot is scoped to
the current run and retains strings only, including an explicitly empty H1.

Canonical corpus collection also shares a bounded content cache within each
build run (including canonical title fallbacks): at most 2,048 nodes and 64 MiB
of assembled content. Keys include the
resolved node text before audience filtering, path, assets, audience, and recursive dependency fingerprints
with their include directives/locations. Different Liquid results therefore do
not share an entry. Nodes with external autotitle dependencies (and their
ancestors) remain isolated. This cache does not persist between builds and is
not used by ordinary Markdown output or configurations that copy include files.

H1 extraction keeps the complete structural token stream and reference
definitions, but parses inline content only for the first Markdown H1 and
possible HTML headings before it. HTML fragments are collected until the first
H1 closes (or the document ends) and parsed once with the existing HTML parser;
ordinary paragraphs after the selected heading are not parsed inline. Candidate
inline tokens are inspected for actual HTML without rendering code examples.
Markdown H1s containing inline HTML reuse the same HTML text extraction after
rendering only that heading; headings without inline HTML keep the token-only
path. HTML-enabled and HTML-disabled parsers are reused independently.
Raw HTML blocks retain literal Markdown, as in the renderer. This preserves
late link definitions and the surrounding context needed by heading attributes
without parsing inline markup in every paragraph. The structural pass still
scales with the complete assembled document.
Link labels escape Markdown syntax, HTML tags, and entity markers to preserve
literal text, and collapse whitespace to stay on one line.

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

### Stripping `<style>` and `<script>` from llms-full.txt

`<style>` and `<script>` HTML blocks are useless for LLM consumption — LLMs
don't execute JavaScript or apply CSS, so these tags only add noise to the
corpus. They can enter the assembled markdown through includes or direct HTML
in source `.md` files.

After `MarkdownCollector.collect()`, each article body is passed through
`stripHtmlTags(body, ['style', 'script'])` (see `llms/utils.ts`). This function:

- Removes `<style>...</style>` and `<script>...</script>` blocks (with content)
- Handles tags with attributes (`<script type="text/javascript">`)
- Handles multiline blocks
- **Preserves** tags inside fenced code blocks (`...` / ~~~...~~~) —
  documentation often shows these as examples

#### Known limitations (accepted for simplicity and performance)

Code block detection is a single pass over the lines that applies the
CommonMark fence rules from `src/core/utils/fence.ts` (``` and ~~~, closing
run at least as long as the opening one). This is intentionally lightweight
to avoid a second full markdown-it parse on every article (the loader
already parses each file once). The following edge cases are **not** handled
and are accepted as known limitations:

| Case                             | Example                        | Effect                                        | Impact                                                     |
| -------------------------------- | ------------------------------ | --------------------------------------------- | ---------------------------------------------------------- |
| 4-space indented code blocks     | `    <style>...</style>`       | Tags stripped                                 | Low — most docs use fences, not indented blocks            |
| YFM shorthand table cell closers | ` ```\|` / ` ```\|\|`          | Fence not detected → tags stripped            | Low — only affects YFM table cells with inline code blocks |
| Deflist marker + fence opener    | `:   ``` `                     | Fence not detected → tags stripped            | Low — rare pattern                                         |
| Blockquote-wrapped fences        | `> ``` `                       | Fence not detected → tags stripped            | Low — rare in practice                                     |
| Unterminated fences              | ` ```go ` (no closing ` ``` `) | Rest of content not protected → tags stripped | Low — malformed markdown                                   |
| Fence inside HTML comment        | `<!-- ``` ... ``` -->`         | May create phantom fence range                | Low — rare                                                 |

A false negative (tag inside an undetected code block gets stripped) only
affects the LLM corpus quality, not the build itself. See ADR-006 for the
full list of edge cases that were encountered and fixed in the loader's
fence detection — those fixes are not replicated here to keep the
implementation simple and fast.

## Consequences

- `llms-full.txt` may be truncated for large docs — this is intentional and
  logged as info, not an error
- The file always contains at least the title and whatever articles fit
- `0` means "use default" (not "no limit"), consistent with `maxAssetSize`
- Hidden pages and complete hidden subtrees never appear in either artifact,
  regardless of `removeHiddenTocItems`; this does not prevent the regular build
  from rendering them
- Inactive `{% if %}` branches do not leak into either file
