# ADR-006: Merge Includes in md2md Mode

## Status

**Implemented (v10). Stages 0–5 are complete: multiline terms (transform), write/read (md2md→md2html), full inlining of all include kinds (indent, hash, terms), link rebasing, source maps. Stage 4 (terms) is implemented: collection, deduplication, conflict resolution, nested includes inside terms. The `{% included %}` fallback is kept as a safety net (and is now mandatory for one specific YFM-shorthand-table case — see Bug 24, and for indent-promotes-to-codeblock cases — see Bug 27). Viewer integration requires no changes. Thirty-three bugs were found in real documentation sets and fixed (Bugs 21–22 were regressions of the Bug 20 fix caught on the Yandex Metrica and Yandex Webmaster support docs; Bug 23 was a separate YFM-table interaction surfaced on Yandex Metrica `pro/price.md`; Bug 24 is a content-shape conflict between inlined includes and YFM shorthand cells, surfaced on Yandex Metrica `general/goal-js-event.md`; Bugs 25–26 are fence-detection failures surfaced on Yandex browser-corporate `cookies-allowed-for-urls.md` and Yateam `datasync/http/data-structure.md`; Bug 27 is an indent-stack regression where merge promotes a normal paragraph to an indented code block, surfaced on Yandex direct-pro `requirements-mediaservices/100-180.md`; Bugs 28–29 are two more fence-detection failures: an end-of-line ` ```|| ` closer inside YFM shorthand cells on Yateam `alice-dev-guide/concepts/test-integration.md` / `test-functional.md`, and a fence opener glued to a deflist `:` or list bullet — surfaced on Yandex Games `rosreestr-games-use.md` and a CatBoost-style list pattern; Bug 30 is a regression introduced by the Bug 29 patch: it stripped a blockquote `>` prefix only on the opener side and not on the closer side, leaving phantom fence ranges across blockquote-wrapped code blocks — surfaced on Tracker `create-filter.md`, Forms `send-request.md`, Webmaster `host-verification-get.md`, XML `response.md` and the user-reported sky-list blockquote-include pattern; Bug 31 is a structural fragility outside `findFencedCodeBlockRanges`: `filterTokens` treated `{skip: 0}` as falsy and walked past the token that had just shifted into the visited index, plus `stripFirstHeading` had a defensive fallback that re-introduced the heading when `notitle` would otherwise yield empty content — together these caused 627 alice HTML files to render a literal `< path="…" keyword="…">` placeholder for the include immediately following a notitle-on-heading-only-section / locale-pruned-by-liquid include; Bug 32 is a non-Unicode anchor regex: `[\w-]+` (ASCII-only `\w`) failed to match a cyrillic-containing anchor `#YNDX-00540-с-Matter`, so `extractSection` returned the whole `popups.md` file instead of one section — surfaced on alice `socket/how-use.md`; Bug 33 is a `#hash` section-boundary divergence: `output-html`'s `cutHeading` used `>=` (ended a section at any same-or-shallower heading) instead of the `===` "same level only" rule used by the viewer's `findBlockTokens` and merge-includes, so a nested include expanding to a shallower heading inside a `notitle` section collapsed it to nothing — surfaced on alice `uz/smart-home/.../unruly.md`). The only deferred item is Stage 6 (frontmatter merging) — and even there a lightweight special case is now implemented: frontmatter passthrough for an empty parent whose body is a single include (chain-aware), see Stage 6 below.**

## Context

### Goal

In `md2md` mode (output-format=md), we need to support “merging” (expanding) include directives—that is, replacing `{% include ... %}` constructs with the contents of the included files.

**Primary motivation**: Reduce the number of requests to S3 when rendering documentation—instead of loading each include file separately, produce a single “flat” Markdown file with all content.

### Current architecture

#### CLI (packages/cli)

1. **Loader** ([`src/core/markdown/loader/resolve-deps.ts`](../src/core/markdown/loader/resolve-deps.ts:10)):
   - Parses `{% include %}` directives with a regular expression
   - Collects dependency metadata (path, location, hash)
   - Does NOT expand content—metadata only

2. **MarkdownService** ([`src/core/markdown/MarkdownService.ts`](../src/core/markdown/MarkdownService.ts:280)):
   - `_graph()` recursively builds the dependency graph
   - Each include is loaded separately via `load()`
   - Returns an `EntryGraph` structure with `{path, content, deps, assets}`

3. **output-md feature** ([`src/commands/build/features/output-md/index.ts`](../src/commands/build/features/output-md/index.ts:139)):
   - Uses `Scheduler` to process content
   - `rehashIncludes` adds a hash to include file paths
   - The `mergeIncludes` option exists but is **not implemented** (defaults to `false`)

4. **output-html plugins** ([`src/commands/build/features/output-html/plugins/includes.ts`](../src/commands/build/features/output-html/plugins/includes.ts:36)):
   - Expands includes at the markdown-it token level
   - Supports `notitle`, `#hash` for partial content
   - Uses `contentWithoutFrontmatter()` to strip YAML frontmatter

#### Transform (packages/transform)

1. **includes plugin** ([`src/transform/plugins/includes/index.ts`](../../transform/src/transform/plugins/includes/index.ts:28)):
   - Runs at the markdown-it token level
   - Recursively expands includes
   - Supports `notitle`, `#hash`
   - Uses `env.includes` to detect cyclic inclusion

2. **includes/collect** ([`src/transform/plugins/includes/collect.ts`](../../transform/src/transform/plugins/includes/collect.ts:59)):
   - Collects includes recursively
   - Uses an `appendix` Map to store content
   - Emits `{% included (path:path) %}...{% endincluded %}` markup

3. **preprocessors/included** ([`src/transform/preprocessors/included/index.ts`](../../transform/src/transform/preprocessors/included/index.ts:77)):
   - Parses `{% included %}` blocks
   - Stores content in `md.included[path]`
   - Removes blocks from the main content

4. **term plugin** ([`src/transform/plugins/term/termDefinitions.ts`](../../transform/src/transform/plugins/term/termDefinitions.ts:34)):
   - Parses term definitions `[*term]: description`
   - Stores them in `state.env.terms`
   - Supports multiline via `{% include %}` directives
   - **Issue**: Works only with includes, not arbitrary content

## Problem

### Challenges when merging includes

#### 1. **notitle** — Removing the heading from included content

**Problem**: For `{% include notitle [](file.md) %}`, the first heading must be removed.

**Current approach** (output-html): `stripTitleTokens()` removes the first three tokens when they are `heading_open`, `inline`, `heading_close`.

**Complexity for md2md**: Work at text level, not tokens. Requires:

- Parsing Markdown to locate the first heading
- Removing it correctly, including possible `{#id .class}` attributes

#### 2. **Partial content via #hash** — Including only part of a file

**Problem**: `{% include [](file.md#section) %}` must include only the section starting at `#section`.

**Current approach** (output-html): `cutTokens()` finds the token with `id=hash` and returns:

- For `paragraph_open` — through `paragraph_close`
- For `heading_open` — through the next heading of the same or higher level

**Complexity for md2md**:

- Parse Markdown to find anchors
- Anchors may be automatic (from heading text) or explicit `{#id}`
- Section boundaries must be determined correctly

#### 3. **Terms (term definitions)** — The hardest problem

**Problem**: Term definitions `[*term]: description` must be visible across the whole document.

**Current architecture**:

```
state.env.terms = {
  ':term1': 'description 1',
  ':term2': 'description 2'
}
```

**Complexities**:

a) **Multiline definitions**: A definition may span multiple lines:

```markdown
[*term]: First line
{% include [](part1.md) %}
{% include [](part2.md) %}
```

Current code in `termDefinitions.ts` supports this via `hasIncludeAfterBlanks()`.

b) **Multi-context**: When merging includes, each file may carry its own term definitions. We must:

- Collect all definitions from all includes
- Resolve conflicts (same term with different definitions)
- Keep terms available in the correct context

c) **Processing order**: Terms are parsed in markdown-it’s `block` rules stage and used in `core`. Text-level merging disrupts that order.

d) **Definitions at end of file**: Under YFM convention, term definitions belong at the end of the file. After merging they may end up in the middle.

---

### Detailed analysis of terms

#### Current limitation

Today a term definition supports multiline content only if a blank line is followed by `{% include %}`:

```typescript
// termDefinitions.ts
function hasIncludeAfterBlanks(state, fromLine, endLine) {
  for (let line = fromLine + 1; line <= endLine; line++) {
    const content = state.src.slice(start, end);
    return INCLUDE_LINE_RE.test(content.trimStart()); // /^{%\s*include\s/
  }
  return false;
}
```

#### Proposed extension

**New rule**: A term definition continues until:

1. The next term definition (`[*other_term]:`)
2. End of file

**Condition**: All term definitions must appear at the end of the file (after the main content).

**Example:**

```markdown
# Main content

Text with a [term](*api) and [another term](*sdk).

<!-- Term definitions section -->

[*api]: API (Application Programming Interface) is a set of
definitions and protocols for building and integrating
software.

Additional information about APIs:

- REST API
- GraphQL API
- gRPC

{% include [](api-examples.md) %}

[*sdk]: SDK (Software Development Kit) is a toolkit that lets you
build applications.

{% include [](sdk-details.md) %}
```

#### Scenarios with includes inside term definitions

**Scenario 1: Include as part of the definition**

```markdown
[*term]: Primary definition
{% include [](details.md) %}
```

When merging, `details.md` is inserted inline:

```markdown
[*term]: Primary definition
Contents of details.md...
```

**Scenario 2: Include carries its own term definitions**

```markdown
<!-- main.md -->

Text with a [term](*api).

[*api]: API definition

<!-- api-include.md (included into main.md) -->

Additional content.

[*sdk]: SDK definition
```

**Handling options:**

| Option                        | Description                                                    | Pros                   | Cons                             |
| ----------------------------- | -------------------------------------------------------------- | ---------------------- | -------------------------------- |
| A. Collect all terms at end   | Move all definitions from includes to the end of the main file | Matches YFM convention | Loses positional context         |
| B. Inline with deduplication  | Keep definitions in place; ignore duplicates                   | Preserves structure    | Breaks “terms at end” convention |
| C. Disallow terms in includes | Error if an include contains terms                             | Simple implementation  | Limits functionality             |
| D. Namespace for terms        | Prefix from filename: `api:sdk`                                | Avoids conflicts       | Harder to use                    |

**Recommendation**: Option A with warnings on conflicts.

#### Full processing example

**Input files:**

```markdown
<!-- main.md -->

# Documentation

We use [API](*api) and [SDK](*sdk).

{% include [](chapter1.md) %}

[*api]: Application Programming Interface
```

```markdown
<!-- chapter1.md -->

## Chapter 1

Working with a [library](*lib).

[*lib]: External library
[*sdk]: Software Development Kit (from chapter1)
```

**Merge result:**

```markdown
# Documentation

We use [API](*api) and [SDK](*sdk).

## Chapter 1

Working with a [library](*lib).

<!-- Term definitions (merged) -->

[*api]: Application Programming Interface
[*lib]: External library
[*sdk]: Software Development Kit (from chapter1)
```

**Note**: `[*sdk]` from `chapter1.md` is used because `main.md` has no definition for `sdk`.

#### Definition conflicts

**Conflict example:**

```markdown
<!-- main.md -->

[*api]: REST API

<!-- include.md -->

[*api]: GraphQL API
```

**Resolution strategies:**

| Strategy   | Result                          | When to use   |
| ---------- | ------------------------------- | ------------- |
| First wins | `[*api]: REST API`              | Default       |
| Last wins  | `[*api]: GraphQL API`           | For overrides |
| Error      | Build error                     | Strict mode   |
| Merge      | `[*api]: REST API\nGraphQL API` | For merging   |

**Recommendation**: “First wins” with a warning in the logs.

#### 4. **Relative paths** — Links and images

**Problem**: An included file may contain relative links:

```markdown
<!-- _includes/snippet.md -->

![image](./image.png)
[link](../other.md)
```

**Complexity**: After insertion into the main file, paths become incorrect.

**Solution**: Rebase all relative paths to the new location.

#### 5. **Frontmatter** — YAML metadata

**Problem**: Included files may have frontmatter:

```yaml
---
csp:
  script-src: ['unsafe-inline']
---
```

**Current approach**: `contentWithoutFrontmatter()` strips frontmatter before insertion.

**Complexity**: Some metadata (CSP, meta) should be merged rather than dropped.

#### 6. **Circular inclusion**

**Problem**: `a.md` includes `b.md`, which includes `a.md`.

**Current approach**: The `env.includes` array tracks the inclusion chain.

**Complexity for md2md**: Preserve this logic when operating at text level.

#### 7. **Tabs, cuts, and other block constructs**

**Problem**: An include may sit inside tabs or a cut:

```markdown
{% list tabs %}

- Tab 1

  {% include [](content1.md) %}

- Tab 2

  {% include [](content2.md) %}

{% endlist %}
```

**Complexity**: Merging must preserve correct nesting and indents.

#### 11. **Nested lists and indents**

**Problem**: An include inside a list must preserve correct indents:

```markdown
1. First item

   {% include [](step1.md) %}

2. Second item
   - Nested list

     {% include [](nested.md) %}
```

**Contents of `step1.md`:**

```markdown
Description of the first step.

- Sub-item A
- Sub-item B

Additional information.
```

**Expected result:**

```markdown
1. First item

   Description of the first step.
   - Sub-item A
   - Sub-item B

   Additional information.

2. Second item
   - Nested list

     Contents of nested.md with correct indents...
```

**Complexities:**

a) **Indent level**: Compute the include directive’s indent and apply it to all included content.

b) **Nested lists in includes**: If the included file contains lists, their indents must be increased relative to the base.

c) **Mixed indents**: Tabs vs spaces, varying indent width.

d) **Code blocks**: Indents inside code blocks must not change.

**Indent handling algorithm:**

```
1. Determine the base indent of the include directive (spaces/tabs count)
2. For each line of included content:
   a. If the line is empty — leave as is
   b. If the line is inside a code block — leave as is
   c. Otherwise — prepend the base indent
3. Process nested includes recursively
```

**Deep nesting example:**

```markdown
- Level 1
  - Level 2
    - Level 3
      {% include [](deep.md) %}
```

If `deep.md` contains:

```markdown
Text

- List
  - Nested
```

Result:

```markdown
- Level 1
  - Level 2
    - Level 3
      Text
      - List
        - Nested
```

#### 8. **Liquid variables and conditionals**

**Problem**: An included file may contain Liquid syntax:

```markdown
{% if var %}
Content
{% endif %}
```

**Complexity**: Variables must resolve in the main file’s context, not the included file’s.

#### 9. **Source maps and line numbers**

**Problem**: After merging, error line numbers refer to the “flat” file, not the originals.

**Solution**: Keep a source map for debugging.

#### 10. **Anchors and ID conflicts**

**Problem**: Different include files may define the same anchors:

```markdown
<!-- file1.md -->

## Introduction {#intro}

<!-- file2.md -->

## Introduction {#intro}
```

**Complexity**: Either rename anchors or emit warnings.

## Decision

### Proposed approach: Two-phase processing

#### Phase 1: Collection and preparation (text level)

1. Recursively walk all includes
2. For each include:
   - Load content
   - Remove frontmatter
   - Rebase relative paths
   - Collect term definitions
   - Apply `notitle` when needed
   - Apply `#hash` filtering when needed
3. Emit special markup for deferred insertion

#### Phase 2: Final assembly

1. Insert prepared content in place of include directives
2. Merge term definitions to the end of the file
3. Merge metadata (CSP, scripts, styles)
4. Generate a source map

### Special markup for deferred insertion

```markdown
<!-- INCLUDE_START path="file.md" notitle="true" hash="section" -->

Contents of the included file

<!-- INCLUDE_END -->
```

This markup allows:

- Deferring final insertion until all data is collected
- Keeping meta-information for debugging
- Easy rollback if something goes wrong

### Handling terms

**Option A: Collect at end of file**

```markdown
<!-- Main content -->

<!-- TERMS_START -->

[*term1]: Definition 1
[*term2]: Definition 2

<!-- TERMS_END -->
```

**Option B: Inline definitions with deduplication**

- Keep definitions in place
- On conflicts, keep the first definition
- Emit warnings on conflicts

**Recommendation**: Option A, matching the YFM convention.

### Indent handling for nested structures

````typescript
function addIndent(content: string, indent: string): string {
  const lines = content.split('\n');
  let inCodeBlock = false;

  return lines
    .map((line) => {
      // Track code blocks
      if (line.trimStart().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
      }

      // Leave blank lines and code blocks untouched
      if (line.trim() === '' || inCodeBlock) {
        return line;
      }

      return indent + line;
    })
    .join('\n');
}
````

## Implementation Plan

> **Important**: Merge includes runs at the same pipeline stage as merge SVG and autotitle—that is, **after Liquid resolution**. Liquid variables should therefore not be an issue.

### Stage 0: Terms — multiline support + lint for includes (CRITICAL)

**Packages**: `packages/transform`, `packages/yfmlint`

**Status**: Implemented.

**Tasks (multiline — done):**

1. ✅ Modified [`termDefinitions.ts`](../../transform/src/transform/plugins/term/termDefinitions.ts:34) — `findDefinitionEnd()` supports multiline without restricting to includes
2. ✅ New rule: term definition continues until the next `[*key]:` or EOF (when `multilineTermDefinitions: true`)
3. ✅ Added `multilineTermDefinitions` option to `MarkdownItPluginOpts` (`typings.ts`)
4. ✅ Unit tests for multiline terms (4 tests in `test/term.test.ts`)
5. ✅ Backward compatibility: defaults to `false`; previous behavior preserved

**Tasks (lint for includes — done):**

1. ✅ `termDefinitions.ts` — `dfn_open` tokens are marked with `from-include="true"`
   when `state.env.includes.length > 0` (term definition is created inside an include context).
   Mechanism: the transform includes plugin uses the `env.includes` array for cycle detection
   (push before parsing the include, pop after). During `getFileTokens()` → `md.parse()`
   the child env inherits `includes` via spread (`{...state.env}`), so `termDefinitions`
   sees a non-empty array.
2. ✅ YFM009 modified — skips `dfn` tokens with `from-include="true"`.
   Previously YFM009 fired when an include file with term definitions (e.g. `duration.md`)
   was attached mid-page: after resolving includes, `dfn` tokens ended up in the middle of the
   unified token stream.
3. ✅ YFM018 (new rule, INFO) — informational message for term definitions from includes.
4. ✅ `LogLevels.INFO` handling in `utils.ts` → `logger.info()`.
5. ✅ Unit tests: 3 YFM009 tests (from-include handling), 3 YFM018 tests.

**Works in both modes:**

- `mergeIncludes: false` — dep files on disk; includes plugin reads and resolves
- `mergeIncludes: true` — `{% included %}` blocks extracted by `extractIncludedBlocks()`,
  content in `pluginOptions.files`; includes plugin resolves from `files` dict or from disk

**Files:**

- `packages/transform/src/transform/plugins/term/termDefinitions.ts` — `findDefinitionEnd()`, `from-include` marking
- `packages/transform/src/transform/typings.ts` — `multilineTermDefinitions` option
- `packages/yfmlint/src/rules/yfm009.ts` — skip `from-include` `dfn` tokens
- `packages/yfmlint/src/rules/yfm018.ts` — new INFO rule
- `packages/yfmlint/src/rules/index.ts` — export yfm018
- `packages/yfmlint/src/config.ts` — `YFM018: LogLevels.INFO`
- `packages/yfmlint/src/utils.ts` — `LogLevels.INFO` handling
- `packages/yfmlint/test/yfm009.test.ts` — 3 new tests (from-include handling)
- `packages/yfmlint/test/yfm018.test.ts` — 3 tests

---

### Stage 1a: Fixing `{% included %}` blocks (fallback mechanism)

**Packages**: `packages/cli`, `packages/transform` (reading — already supported)

**Status**: Implemented (v4). Write and read (md2md→md2html) work.

**Concept**: `{% included %}` blocks are a fallback for includes that cannot safely be
inlined (see Q9). `{% include %}` directives are kept as-is; dep content is appended
to the end of the file. The transform pipeline processes them on read.

**Tasks (v2 — done):**

1. ✅ Rewrite `merge-includes.ts` — emit `{% included %}` blocks instead of inlining
2. ✅ Run mergeIncludes only at root level (`!write`), not for deps
3. ✅ Skip writing separate dep files when `mergeIncludes`
4. ✅ Implement `extractIncludedBlocks()` — parse `{% included %}` blocks for reading
5. ✅ Integrate reading into `run.transform()` — fallback from `{% included %}` into `files` dict
6. ✅ Unit tests (42) and e2e tests (5)

**Tasks (v3 — read fixes, done):**

1. ✅ `MarkdownService.load()` — graceful ENOENT: when dep file is missing (content embedded
   in parent via `{% included %}`), resolve with empty content instead of reject
2. ✅ `run.transform()` — merge ALL `includedFiles` into `files` dict (not only from `deps`)
3. ✅ `run.lint()` — same as `transform()`, uses `extractIncludedBlocks`
4. ✅ Removed `rebaseRelativePaths` from `collectAllDeps` — paths inside `{% included %}` blocks
   stay original; transform pipeline resolves them via colon-chain key
5. ✅ `_deps()` — try/catch for recursive dep loading (safety net)
6. ✅ Updated e2e tests — assert original paths instead of rebased paths

**Tasks (v4 — loader isolation, done):**

1. ✅ `resolveDependencies` — exclude `{% included %}` blocks from `{% include %}`
   directive discovery. Otherwise the loader resolved `{% include %}` inside `{% included %}` blocks
   relative to the root file → "out of project scope" on nested includes.
2. ✅ `resolveAssets` — exclude `{% included %}` blocks from asset discovery.
   Otherwise assets from embedded content were rebased relative to the root file → ENOENT.
3. ✅ `resolveHeadings` — same exclusion for headings.
4. ✅ `findIncludedBlockRanges()` moved to `utils.ts` as a shared utility.
5. ✅ Fixed e2e test "without flag" — `mergeIncludes` defaults to `true`;
   the test must pass `--no-merge-includes` explicitly.

**Tasks (TODO):**

1. ✅ Verify viewer integration — no changes needed, `root` is already passed (see v6)
2. ✅ E2E tests for full cycle — covered in `tests/e2e/merge-includes.spec.ts`

**Files:**

- `src/commands/build/features/output-md/plugins/merge-includes.ts` — emit `{% included %}` blocks
- `src/commands/build/features/output-md/index.ts` — `!write` guard + skip dep file writing
- `src/commands/build/features/output-md/utils.ts` — extend `HashedGraphNode` (`deps` added)
- `src/commands/build/extract-included.ts` — `extractIncludedBlocks()` utility for reading
- `src/commands/build/run.ts` — integrate extractIncludedBlocks into `transform()` and `lint()`
- `src/core/markdown/MarkdownService.ts` — graceful ENOENT for dep files
- `src/core/markdown/utils.ts` — `findIncludedBlockRanges()` to filter content inside `{% included %}` blocks
- `src/core/markdown/loader/resolve-deps.ts` — exclude `{% included %}` from dep discovery
- `src/core/markdown/loader/resolve-assets.ts` — exclude `{% included %}` from asset discovery
- `src/core/markdown/loader/resolve-headings.ts` — exclude `{% included %}` from heading discovery
- `src/commands/build/extract-included.spec.ts` — 9 unit tests for extractIncludedBlocks
- `src/commands/build/features/output-md/plugins/merge-includes.spec.ts` — 127 unit tests
  (rebaseUrl, rebaseRelativePaths, canInlineInclude, stripFirstHeading, addIndent,
  extractSection, prepareInlinedContent, collectFallbackDeps, linked images, code fences,
  nested links, term references, term boundary, catastrophic backtracking)
- `tests/e2e/merge-includes.spec.ts` — 7 e2e tests (simple inline, nested, relative-paths,
  hash-fallback, term-inline, inline-context, without flag)
- `tests/mocks/merge-includes/` — test fixtures

**Implementation details:**

1. **Write (md2md)**: Plugin `mergeIncludes(run, deps)` — `StepFunction`, runs
   only when `!write` (root level). Walks the dep tree recursively via `collectAllDeps()`,
   building colon-chain keys (`_includes/outer.md:inner.md`) for nested includes.
   For each dep: strips frontmatter, emits
   `{% included (key) %}...{% endincluded %}` block. Paths in content are NOT rebased —
   transform pipeline resolves them via colon-chain key. All blocks are flat (not nested),
   appended via one Scheduler actor at end of content.

2. **Colon-chain keys**: Format `parentLink:childLink` matches transform’s
   `preprocessors/included`. Resolves nested paths correctly:
   `_includes/outer.md:inner.md` → resolve `_includes/outer.md` from root, then `inner.md` from that result.

3. **Read (CLI output-html)**: `run.transform()` and `run.lint()` call
   `extractIncludedBlocks(markdown, file)` before passing to transformer/linter.
   The function parses `{% included %}` blocks, resolves colon-chain keys to normalized paths,
   and returns `{content, files}`. `files` dict is `{...depFiles, ...includedFiles}` —
   embedded content wins; disk fallback for files not embedded in blocks.

4. **Graceful ENOENT**: `MarkdownService.load()` on ENOENT for dep files (when `from`
   is set) does not reject Defer; it resolves with empty content. Prevents cascading
   errors during recursive dep walk (`_deps()`), because dep content is embedded in parent.

5. **Read (viewer/transform)**: Transform already reads `{% included %}` blocks:
   - `preprocessors/included` parses blocks → `md.included[absolutePath]`
   - `plugins/includes` checks `md.included?.[pathname]` → `getFileTokens(pathname, state, options, included)`
   - For correct behavior the viewer must pass `root` in transform options (separate task).

6. **Dep files not written**: When `config.mergeIncludes`, dump() skips writing
   separate include files. All content is embedded in the root file.

7. **Paths NOT rebased**: Content in `{% included %}` blocks keeps original
   relative paths. Transform pipeline resolves them correctly because it knows the source file
   from the colon-chain key. `rebaseRelativePaths()` kept for future Step 1b (inline includes).

**Result**: Working fallback mechanism for includes that cannot be inlined.

---

### Stage 1b: Simple include inlining

**Package**: `packages/cli`

**Status**: Implemented (v5). Extended in later stages to 100% coverage.

**Concept**: Includes that meet simplicity criteria (see Q9) are inlined
in place of the `{% include %}` directive. Others use `{% included %}`
fallback from Stage 1a. This is a hybrid approach where the output file may contain
both inlined content and `{% included %}` blocks at once.

**Inlining criteria (final, after v10):**

- ~~No `[*key]:` pattern in included file content~~ → lifted in Stage 4
- ~~Include directive placed BEFORE first term definition~~ → lifted in Stage 4
- Include directive is the only content on its line (standalone check)
- `notitle` — supported (simple removal of first heading)
- `#hash` — supported (section extraction with correct skipping of code blocks)
- Indents — supported (preserving actual indent characters: tabs, spaces, mixed)
- Term definitions — supported (collection, deduplication, conflict resolution)
- Nested includes — supported (recursive resolution)

**Tasks (done):**

1. ✅ Implemented `canInlineInclude(dep, parentContent)` — checks indent, hash in link, term definitions
2. ✅ Implemented `stripFirstHeading(content)` — removes first heading for `notitle`
3. ✅ Modified `mergeIncludes` plugin — for each dep: if `canInlineInclude` → inline,
   else → `{% included %}` fallback. Deduplication by key via `seen` Set.
4. ✅ Nested includes handling: inlined deps use `collectFallbackDepsForInlined`
   with rebased keys; non-inlined use `collectFallbackDepsWithChain` with colon-chain.
5. ✅ Unit tests for `canInlineInclude` (6), `stripFirstHeading` (8), linked image rebase (2)
6. ✅ E2E tests: simple inline, nested (outer inline + inner fallback), relative-paths rebase,
   hash-fallback deduplication, without flag
7. ✅ Fixed `rebaseLinksInLine` — handling for linked images `[![alt](img)](url)`
   via `LINKED_IMAGE_RE`, because `INLINE_LINK_RE` only matched the inner part.
8. ✅ Updated snapshots for all affected e2e tests (preprocess, regression, includes,
   pdf-page, include-toc, metadata)

**Nested includes handling:**

```
Tree: main.md → outer.md (simple) → inner.md#section (complex — hash)

Result:
1. outer.md is inlined → its content (with rebased paths) is inserted into main.md
2. inner.md — complex → added as {% included (_includes/inner.md) %}
   (path rebased from outer.md to main.md, no colon-chain because outer.md is inlined)
3. {% include %} directive for inner.md inside outer.md content is already rebased
```

**`canInlineInclude` example:**

```typescript
interface InlineCheckParams {
  includeLine: string;
  includeContent: string;
}

const HASH_RE = /\.md#[\w-]+/;
const TERM_DEF_RE = /^\[\*\w+\]:/m;

function canInlineInclude({includeLine, includeContent}: InlineCheckParams): boolean {
  const indent = includeLine.match(/^(\s*)/)?.[1] ?? '';
  if (indent.length > 0) return false;

  if (HASH_RE.test(includeLine)) return false;

  if (TERM_DEF_RE.test(includeContent)) return false;

  return true;
}
```

**`stripFirstHeading` example:**

```typescript
const HEADING_RE = /^(#{1,6})\s+.*(?:\{#[\w-]+\})?$/;

function stripFirstHeading(content: string): string {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    if (HEADING_RE.test(trimmed)) {
      lines.splice(i, 1);
      // Remove trailing empty line after heading
      if (i < lines.length && lines[i].trim() === '') {
        lines.splice(i, 1);
      }
      break;
    }
    break; // First non-empty line is not a heading — nothing to strip
  }
  return lines.join('\n');
}
```

**Limitations (after all stages):**

- ~~Includes with `#hash` are not inlined~~ → addressed in Stage 3 (v7)
- ~~Indented includes are not inlined~~ → addressed in Stage 2 (v7)
- ~~Includes with term definitions are not inlined~~ → addressed in Stage 4 (v10)
- HTML links/images are not rebased (Markdown syntax only)
- Reference-style links `[text][ref]` are not rebased (definitions and inline links only)

**Outcome**: 100% of includes are inlined in place. The `{% included %}` fallback remains as a safety net but is not used under normal operation.

**Tasks (v8 — bug fixes and refactoring, done):**

Large-scale testing on real documentation (wiki/common, marketplace, ledger-guide, etc.)
surfaced three bugs and several opportunities to simplify:

1. ✅ **ERR tab-list-not-closed**: `extractSection` did not skip fenced code blocks — headings
   inside ` ``` ` blocks wrongly ended the section, cutting off `{% endlist %}`.
   **Fixed**: introduced shared `processCodeFence`/`FenceState` — used in both
   `rebaseRelativePaths` and `extractSection`.

2. ✅ **Indent with tabs and spaces**: `addIndent` used `' '.repeat(indent)`, losing
   real tab characters. **Fixed**: `parentContent.slice(lineStart, dep.location[0])`
   captures the exact indent string, preserving tabs and mixed indents.

3. ✅ **Includes inside terms**: `TERM_DEF_RE` (`/^\[\*\w+\]:/m`) did not recognize terms with hyphens
   (`[*ekat-mgt]:`) and other special characters. **Fixed**: regex updated to
   `/^\[\*[^[\]]+\]:/m` — allows any characters except `[` and `]` in the term name.

4. ✅ **Term boundary rule**: `canInlineInclude` now checks: if the include directive
   appears in parent content after the first term definition (`TERM_DEF_RE`), it is not
   inlined. Rationale: under YFM convention all terms sit at the end of the page, so
   includes after the first term belong to the terms section and must not expand until Stage 4.

5. ✅ **Standalone check**: `canInlineInclude` verifies that the include directive is the only
   content on its line (no text before/after). This catches inline contexts: `> {% include %}`,
   `| {% include %} |`, `text {% include %}`, where inlining multiline content would break
   Markdown structure. It does not duplicate term checks — it applies to non-term inline contexts.

6. ✅ **Refactoring `merge-includes.ts`**:
   - All regex constants moved to the top of the file
   - `matchHeading` + `resolveHeadingAnchor` merged into `parseHeading` (returns
     `{level, anchor}` directly)
   - `matchParagraphAnchor` inlined into `extractSection`
   - Heading handling extracted to `processHeadingForSection` — cognitive complexity of
     `extractSection` reduced from 17 to ~12 (SonarCloud limit: 15)
   - Single `processCodeFence`/`FenceState` for code fence tracking
   - `HEADING_RE` removed (replaced by `parseHeading`)
   - Restored `String.raw` in regex template literals
   - Totals: 509 lines, 127 unit tests, 7 e2e tests

**What broke and was fixed (v5–v6) — link rebasing:**

Inlining with `rebaseRelativePaths()` caused many `YFM003` (unreachable link) errors on real
documentation sets. Root causes:

1. **Incomplete Markdown link syntax coverage**: The initial `INLINE_LINK_RE` did not cover linked images
   with attributes, double-bracket autotitle syntax `[[!TITLE path]](url)`, or nested links.
   Each new edge case needed its own regex or more complex existing ones.

2. **Catastrophic backtracking (ReDoS)**: Trying to handle nested parentheses via
   `(?:[^\[\]]*|\[[^\]]*\])*` led to exponential time on lines with unclosed
   parentheses (often in code spans with `<`, `>`, `[` in the text).

3. **Incorrect code block detection**: Inline backtick expressions like `` `code()` ``
   were interpreted as opening a fenced code block → all links after them were skipped.

4. **Rebasing “non-links”**: YFM term references (`[*term]`) and Liquid directives (`{%...%}`)
   were incorrectly rebased as file paths.

**Evolution of the solution:**

| Version | Approach                                         | Issues                            |
| ------- | ------------------------------------------------ | --------------------------------- |
| v5.0    | `INLINE_LINK_RE` + `LINKED_IMAGE_RE`             | Missed attributes, double-bracket |
| v5.1    | + `FULL_LINKED_IMAGE_RE` + placeholder mechanism | Double-rebase, complexity         |
| v5.2    | + `DOUBLE_BRACKET_LINK_RE` + nested parens       | Catastrophic backtracking         |
| v5.3    | Backtrack-safe regex                             | Did not handle nested links       |
| **v6**  | **`LINK_URL_RE = /(\]\(\s*)([^)\s]+)/g`**        | **None — covers all cases**       |

The v6 final solution replaces all complex regexes with one simple matcher for `](url`
in any context. That pattern is shared by ALL Markdown link types.

---

### Stage 2: List indent handling → wider inlining

**Package**: `packages/cli`

**Status**: Implemented (v7).

**Concept**: Remove the `indent === 0` restriction from `canInlineInclude()`. After implementation,
includes inside lists, tabs, and cuts are also inlined in place.

**Tasks (done):**

1. ✅ Implemented `addIndent(content, indent)` — adds indent to every line except the first (it already continues the parent indent) and empty lines
2. ✅ Include directive indent is taken from `parentContent` via
   `parentContent.slice(lineStart, dep.location[0])` — preserves real indent characters
   (tabs, spaces, mixed)
3. ✅ `addIndent` integrated into `prepareInlinedContent` — when indent is present it is applied
4. ✅ `canInlineInclude()` — indent check removed
5. ✅ Unit tests for `addIndent` (6 tests, including mixed tab+space), updated tests for
   `canInlineInclude` and `prepareInlinedContent`

**Implementation details:**

`addIndent(content, indent)` takes an indent string (not a number!) — the actual characters
from parent content. That correctly handles tabs, spaces, and combinations. It adds indent to all lines except the first and empty lines. The first line does not get extra indent because it already continues the existing parent indent.

Cross-platform: `addIndent` handles `\r\n`, `\r`, and `\n` line breaks while preserving original characters.

**Outcome**: Inline coverage grew from ~80% to ~90%.

---

### Stage 3: `#hash` section extraction → wider inlining

**Package**: `packages/cli`

**Status**: Implemented (v7).

**Concept**: Remove the `#hash` restriction from `canInlineInclude()`. Implement text-level search and
section extraction from content.

**Tasks (done):**

1. ✅ Implemented `extractSection(content, hash)` — find section by anchor:
   - Automatic anchors (from heading text via `slugify`)
   - Explicit `{#id}` anchors on headings
   - Paragraph anchors `{#id}` (not on headings — paragraph is extracted)
   - Section boundaries (up to the next heading of the same or higher level)
   - Skips fenced code blocks — headings inside ` ``` `/`~~~` do not end the section
   - If anchor not found — returns full content (graceful fallback)
2. ✅ Integrated into `prepareInlinedContent`: when `#hash` is present in `dep.link`,
   `extractSection` runs before `stripFirstHeading` and `rebaseRelativePaths`
3. ✅ `canInlineInclude()` — hash check removed
4. ✅ Unit tests for `extractSection` (10 tests): explicit anchor, auto-slug,
   same-level boundary, lower-level boundary, EOF, sub-headings, not-found, paragraph anchor,
   headings inside code blocks (3-tick and 4-tick fences)

**Deps caching bug fix:**

While implementing stage 3 a bug was found in `output-md/index.ts`: `dump()` cached
results by `graph.path`. When the same file was included twice with different `#hash`
values (e.g. `file.md#section-a` and `file.md#section-b`), the second dep inherited `link`, `match`,
and `location` from the first. **Fixed**: after `dump()`, `link`, `match`, and `location` from the original `EntryGraphNode` are reapplied on top of the cached result.

**Outcome**: Inline coverage grew from ~90% to ~95%.

---

### Stage 4: Terms — full support (collection, merge, conflicts) → 100% inlining

**Packages**: `packages/cli`, `packages/transform`

**Status**: Implemented (v10).

**Concept**: Remove the term-definitions restriction from `canInlineInclude()` and implement
conflict handling at the same time. After this stage every include is inlined.

#### Key case: term without a definition on the parent page

The parent page may **use** a term (`[text](*api)`) but **not define** it.
The definition lives somewhere in the include chain. That is a valid pattern — one definition reused across pages.

**Example:**

```markdown
<!-- main.md — uses term but does not define -->

Working with [API](*api) and [SDK](*sdk).

{% include [](chapter1.md) %}
{% include [](chapter2.md) %}

<!-- chapter1.md — defines *api -->

API description.

[*api]: Application Programming Interface

<!-- chapter2.md — also defines *api (same) and *sdk -->

SDK description.

[*api]: Application Programming Interface
[*sdk]: Software Development Kit
```

After merging:

```markdown
Working with [API](*api) and [SDK](*sdk).

API description.

SDK description.

[*api]: Application Programming Interface
[*sdk]: Software Development Kit
```

Term `[*api]` is defined identically in two includes → no duplicate is created.
Term `[*sdk]` appears in only one include → it is simply moved to the end.
The parent had no definitions → terms are available through collected definitions.

#### Algorithm for processing terms when merging

```
Input: root content + list of deps (each dep = {path, content, includeLine})

1. COLLECT DEFINITIONS
   For root and each dep:
   a. Find all [*key]: definition in content
   b. Store in Map<key, Array<{definition, sourcePath}>>
   c. Remove definitions from content (they will be appended at the end)

2. DEDUPLICATION
   For each key in Map:
   a. If all definitions are identical → keep one
   b. If definitions differ → conflict (see step 3)

3. CONFLICT RESOLUTION
   On conflict (same key, different content):
   a. The first definition (from root or first dep in traversal order) keeps
      the original [*key]
   b. Later definitions are renamed: [*key] → [*key--sourcePath]
      where sourcePath is the normalized path to the source file
      (e.g. [*api--_includes/chapter2]: GraphQL API)
   c. All references in that dep’s content are updated:
      [text](*key) → [text](*key--sourcePath)
   d. Emit a warning listing all conflicting sources

4. UNUSED DEFINITIONS (orphaned definitions)
   A definition from an include unused anywhere in the assembled document —
   is still appended at the end. Transform removes unreferenced terms at render time.

5. USE WITHOUT DEFINITION
   Term [text](*key) in root with no [*key]: in root is valid if the definition
   appears in some dep. The collection algorithm (step 1) covers this automatically.

6. FINAL ASSEMBLY
   All collected definitions (after deduplication and renaming)
   are appended to the end of the main file.
```

#### Conflict suffix format: path instead of hash

Instead of an unreadable hash (`[*api-f7e8d9]`), a normalized path to the source file is used.
That makes it easy to see where a conflicting term came from.

**Path normalization for the suffix:**

- Strip `_includes/` prefix (if present)
- Replace `/` with `-`
- Strip `.md` extension
- Example: `_includes/api/chapter2.md` → `api-chapter2`

**Format**: `[*key--normalized-path]`

The `--` delimiter (double hyphen) avoids clashes with ordinary hyphens
in term names (`[*my-term]`) and file names.

**Conflict example:**

```markdown
<!-- main.md -->

Uses [API](*api) for REST.
[*api]: REST API for working with data

<!-- _includes/graphql/intro.md -->

Uses [API](*api) for GraphQL.
[*api]: GraphQL API for queries
```

After merging:

```markdown
Uses [API](*api) for REST.

Uses [API](*api--graphql-intro) for GraphQL.

[*api]: REST API for working with data
[*api--graphql-intro]: GraphQL API for queries
```

#### “First wins” rule for the original key

On conflict the original key (without suffix) stays with **the first definition
in include-tree traversal order** (depth-first, pre-order):

1. Root file — always first
2. Then — deps in the order `{% include %}` directives appear in root
3. For nested deps — same order recursively

So if root defines `[*api]`, its definition always “wins”.
If root does not define it, the first include in the chain wins.

**Tasks (done):**

1. ✅ Implemented `extractTermDefinitions(content)` — parsing and extracting term definitions
2. ✅ Implemented `normalizePathForSuffix(depPath)` — path normalization for suffix
3. ✅ Implemented collection, deduplication, and conflict-resolution algorithm
4. ✅ Updates `[text](*key)` → `[text](*key--path)` in content on conflict
5. ✅ Warnings on conflicts with sources listed
6. ✅ Updated `canInlineInclude()` — term check removed; all includes inlined
7. ✅ Unit tests: term collection, deduplication, conflicts, undefined term in root
8. ✅ E2E tests: terms in includes, shared terms, conflicts, root without definitions
9. ✅ Recursive resolution of nested includes (including includes inside term definitions)
10. ✅ Fixed `termReplace` in `@diplodoc/transform` — correct behavior when `multilineTermDefinitions: false`

**Additional shipped behavior:**

- Inlining includes inside definition lists (`:   {% include ... %}`), ordered/unordered lists
- Inlining includes inside indented multiline term definitions
- Inline code spans protected from false-positive link rebasing (placeholder mechanism)
- Stripping leading/trailing newlines when inlining for correct list context
- Filtering duplicate `_assets/` resources in `MetaService.addResources`

**Outcome**: 100% inline coverage. `{% included %}` fallback remains in code
as a safety net but is unused under normal operation.

---

### Stage 5: Source maps (inline comments)

**Package**: `packages/cli`

**Status**: Implemented (v9).

**Tasks (done):**

1. ✅ Source map comment generation implemented in `prepareInlinedContent`
2. ✅ Added `enableSourceMaps` to `prepareInlinedContent` and `mergeIncludes` (default `true`)
3. ✅ Added `--source-maps` option to config (default `true`)
4. ✅ Unit tests for `prepareInlinedContent` with source maps (6 snapshot tests)
5. ✅ Unit tests for `mergeIncludes` with source maps (5 snapshot tests)

**Implementation details:**

Source map comments are added in `prepareInlinedContent`:

- Format: `<!-- source: path -->` at the start and `<!-- endsource: path -->` at the end
- Wraps all content from the included file
- Not emitted for empty or whitespace-only content
- Preserves indents when inlining inside lists/tabs

The `--source-maps` CLI option and `sourceMaps` config control comment generation:

- Default `true` — comments are emitted
- `false` — disables generation for a clean output

**Sample output:**

```markdown
# Main content

<!-- source: _includes/chapter.md -->

## Chapter 1

Chapter body...

<!-- endsource: _includes/chapter.md -->

<!-- source: _includes/section.md -->

### Subsection

Additional content.

<!-- endsource: _includes/section.md -->
```

**Files:**

- `src/commands/build/features/output-md/plugins/merge-includes.ts` — updates to `prepareInlinedContent` and `mergeIncludes`
- `src/commands/build/features/output-md/config.ts` — `sourceMaps` option
- `src/commands/build/features/output-md/index.ts` — wiring option into config and `mergeIncludes` call
- `src/commands/build/features/output-md/plugins/merge-includes.spec.ts` — 11 new snapshot unit tests

**Outcome**: Debugging merged files via source map comments.

---

### Stage 6: Frontmatter merging (PARTIALLY IMPLEMENTED)

**Status**: A lightweight special case is implemented; the general merge is still deferred.

**Implemented (lightweight case): frontmatter passthrough for an empty parent.**
When the parent file has **no frontmatter of its own** and its body is **nothing but a single `{% include %}`** (only whitespace — spaces, tabs, newlines — allowed around it), the included file's authored frontmatter is propagated into the parent's output frontmatter. Without this, merge-includes strips the include frontmatter (`contentWithoutFrontmatter`) and the merged parent loses its `title`/metadata.

- Implementation: [`features/output-md/frontmatter-propagation.ts`](../src/commands/build/features/output-md/frontmatter-propagation.ts) (`resolvePropagatedFrontmatter` / `getSoleIncludeDep` / `isMeaningfulFrontmatter`), wired into the `OutputMd` markdown `Dump` hook ([`features/output-md/index.ts`](../src/commands/build/features/output-md/index.ts)) right before `run.meta.dump`, gated on `mergeIncludes`.
- Behavior: authored frontmatter is read via `run.markdown.meta(path)` (the `mangleFrontMatter` bucket — no system `vcsPath`/`generator` noise). Propagation happens **only when the parent has no authored frontmatter** (parent authored metadata is never overridden); **all** authored fields of the resolved include are propagated; the resolver **descends a chain** of "empty-except-single-include, no-frontmatter" nodes to the first node that has frontmatter (with cycle protection).
- Tests: unit `frontmatter-propagation.spec.ts`; e2e `empty-parent-frontmatter` and `empty-parent-frontmatter-chain` in `tests/e2e/merge-includes.spec.ts`.

**Tasks (still deferred — general merge):**

1. Decide which frontmatter fields to merge when the parent is NOT empty (has its own content/frontmatter)
2. Implement merge strategy for CSP, scripts, styles across all inlined includes
3. Add tests

**Outcome**: Empty parent stubs inherit the include's frontmatter; full metadata merge for non-empty parents remains future work.

## Overall implementation status

All primary stages (0–5) are **complete** and tested:

- **Stage 0** — multiline term definitions in `@diplodoc/transform` (`multilineTermDefinitions` option)
- **Stage 1a** — `{% included %}` write/read fallback (md2md → md2html)
- **Stage 1b** — simple inlining (indent=0, notitle, no hash/terms)
- **Stage 2** — indent handling (lists, definition lists, tabs, mixed indents)
- **Stage 3** — `#hash` section extraction (code blocks, custom anchors)
- **Stage 4** — full term support (collection, deduplication, conflicts, nested includes)
- **Stage 5** — source maps (inline `<!-- source: path -->` comments)

**Not implemented (deferred):**

- Stage 6 — frontmatter merging: general case deferred. A lightweight special case is **implemented** — frontmatter passthrough for an empty parent (body is a single include, no own frontmatter), chain-aware.
- Stage 7 — duplicate anchor detection (low priority)

**Testing:**

- Unit tests: `merge-includes.spec.ts` (inlining, terms, rebasing, source maps, hash extraction)
- E2E tests: `tests/e2e/merge-includes.spec.ts` (full md2md → md2html cycle)
- Regression tests: `tests/mocks/regression/` (input/output snapshots)
- Large-scale runs on real docs: alice, ydb, yt, wiki, travel, etc.
- 22 bugs found and fixed (see Known Bugs)

## Consequences

### Positive

✅ Fewer S3 requests when rendering  
✅ Simpler client-side rendering architecture  
✅ Ability to cache “flat” files  
✅ 100% inline coverage — all includes expanded in place

### Negative

❌ Larger output files  
❌ Harder debugging (mitigated by Stage 5 source maps)  
❌ Potential issues with very large documentation sets

### Risks

⚠️ Anchor and ID conflicts (warnings when detected; full detection — Stage 7)  
⚠️ Surprising behavior in deep nesting (validated on real docs)  
⚠️ Performance with deeply nested includes

## Known Bugs (found and fixed)

Large-scale testing on real documentation (alice, ydb, yt, wiki, travel, etc.)
surfaced 10 bugs. Further passes (webmaster, multiline terms, blockquotes, tables) found
eight more. Two more were reported on internal LPC / IDM doc sets (HTML comment with blank
lines inside an indented context; `{% include %}` shown as a code example inside a fenced
code block). Two more (Bugs 21–22) were regressions of the Bug 20 fix surfaced on Yandex
Metrica and Yandex Webmaster support docs: Bug 21 was a fence range that touched the
next line and dropped the first `{% include %}` placed immediately after a closing
` ``` ` fence; Bug 22 was an unterminated-fence branch that silently extended a malformed
or deflist-paired opener all the way to EOF, dropping every real include below it.
Bug 23 was an unrelated YFM-table interaction surfaced on Yandex Metrica
`pro/price.md`: when an include in a YFM shorthand cell was followed by `||` on the
same line and the inlined content ended with a closing HTML block tag, a single `|`
character leaked into the rendered cell because of how the YFM-table plugin and
`markdown-it.getLines()` interact at the cell boundary. Bug 24 was a related but
distinct content-shape issue surfaced on Yandex Metrica `general/goal-js-event.md`:
inlining content containing a `|` character (e.g. an inline-code regex like
`` `button|buy` ``) into a YFM shorthand cell breaks the cell layout because the
YFM table parser does not skip pipes inside inline code by default. All fixed
(Bugs 1–24 below).

### Bug 1: `<style>` tag stripped when inlining inside lists

**Symptom**: If an include file contained `<style>` and was included inside a list,
styles were stripped.

**Cause**: `canInlineInclude` already had `hasTopLevelHtmlBlock` — type-1
HTML blocks (`<script>`, `<style>`, `<pre>`, `<textarea>`) are not inlined when there is
indent, because markdown-it parses them as plain text when indented. Such includes
go to the `{% included %}` fallback.

**Resolution**: No code fix needed — the issue was an outdated test build.
After rebuilding the CLI, behavior was correct.

**Files**: `merge-includes.ts` (`canInlineInclude` → `hasTopLevelHtmlBlock`)

---

### Bug 2: Extra `_assets/` links in HTML with `--merge-includes`

**Symptom**: With `--merge-includes`, extra `<link>` and `<script>` tags appeared for extensions
(`_assets/cut-extension.css`,
`_assets/tabs-extension.js`, etc.) that were not on disk. The browser returned 404.

**Root cause**: Extension plugins (`@diplodoc/cut-extension`,
`@diplodoc/tabs-extension`, `@diplodoc/file-extension`) add `_assets/{name}-extension.{js,css}` to `env.meta` when they detect their patterns.
Unlike mermaid/latex/page-constructor, the CLI did not override `runtime` for
these plugins (they are imported from `@diplodoc/transform/lib/plugins/...` as
ready-made markdown-it plugins with default `_assets/` paths).

Without `--merge-includes` the issue was masked: the CLI includes plugin creates a
`{...env}` spread copy on nested `md.parse()`, losing `env.meta` mutations
from nested parses (meta lives on the copy, not the original env’s getter/setter). With `--merge-includes` content is inlined into the main file, plugins see patterns directly and correctly add
`_assets/` paths to meta via getter/setter.

Real extension runtime files are already in the app bundle (`_bundle/app-*.{js,css}`);
standalone `_assets/` files are not copied.

**Resolution**: Added a `Meta.Dump` hook in the output-html feature that filters
`_assets/{name}-extension.{js,css}` using regex `BUNDLED_EXTENSION_ASSET_RE`.
The filter runs at meta finalization (dump), covering every path that adds resources (markdown, singlepage, pdf).

The first attempt (filter `!s.startsWith('_assets/')` in `MetaService.addResources`)
was too aggressive — it removed user `_assets/` files from frontmatter.

**Files**:

- `output-html/utils.ts` (`filterBundledExtensionAssets`, `BUNDLED_EXTENSION_ASSET_RE`)
- `output-html/index.ts` (Meta.Dump hook)

---

### Bug 3: Inconsistent `<p>` wrapping in lists

**Symptom**: When inlining into a list, items wrapped in `<p>` even though without `--merge-includes` they did not.

**Cause**: Inlined `depContent` kept trailing newlines from the included file.
Extra blank lines between list items switched markdown-it to “loose list” mode where each item is wrapped in `<p>`.

**Resolution**: In `prepareInlinedContent`, strip trailing newlines:
`depContent = depContent.replace(/\n+$/, '')`.

**Files**: `merge-includes.ts` (`prepareInlinedContent`)

---

### Bug 4: Trailing spaces in inline code

**Symptom**: Trailing spaces disappeared from `<span>` elements with `--merge-includes`.

**Cause**: Not a merge-includes bug. Difference comes from anchor plugin behavior in
`@diplodoc/transform`, which handles trailing whitespace differently depending on
context (inline vs block).

**Resolution**: No change needed — behavior is correct.

---

### Bug 5: `#hash` section extraction fails for `{ #overview }` with spaces

**Symptom**: `{% include [](file.md#overview) %}` did not find the section when the file used
`## Overview { #overview }` (spaces inside braces).

**Cause**: Regex `CUSTOM_ANCHOR_RE` required `{#id}` without spaces.

**Resolution**: Regex updated for spaces: `{\s*#([\w-]+)\s*}`.

**Files**: `merge-includes.ts` (`CUSTOM_ANCHOR_RE`)

---

### Bug 6: Angle brackets in headings `<key>` truncated in slug generation → ID collision

**Symptom**: Headings `!inherit:<key>` and `!inherit` produced the same `id="inherit"`,
causing anchor collisions.

**Cause**: `headingInfo` in `@diplodoc/transform` skipped `text_special` tokens (from HTML entities `<`, `>`),
keeping only `text` tokens. `<key>` was lost from the slug.

**Resolution**: `headingInfo` (`packages/transform/src/transform/utils.ts`) now handles
`text_special` tokens alongside `text`.

**Files**: `packages/transform/src/transform/utils.ts` (`headingInfo`)

---

### Bug 7: Missing heading id `#column-naming-rules`

**Symptom**: With `--merge-includes`, the heading did not get id `column-naming-rules` in HTML.

**Cause**: Same as Bug 6 — angle brackets in neighboring headings caused ID collisions and unpredictable anchor generation.

**Resolution**: Covered by Bug 6 fix. After rebuilding the CLI the issue disappeared.

---

### Bug 8: False replacement of `YPath<Type>[Strict](yson, ypath)` in inline code

**Symptom**: `` `YPath<Type>[Strict](yson, ypath)` `` in inline code was incorrectly rebased —
`(yson, ypath)` was treated as a Markdown link.

**Cause**: `rebaseLinksInLine` applied `LINK_URL_RE` to the entire line, including
inline code span contents (backtick text).

**Resolution**: Placeholder mechanism in `rebaseLinksInLine`:

1. Inline code spans (`` `...` ``) temporarily replaced with placeholders (`\x00CS<idx>\x00`)
2. Link rebasing applied to the remainder
3. Placeholders restored

**Files**: `merge-includes.ts` (`rebaseLinksInLine`)

---

### Bug 9: Content shift in lists when inlining

**Symptom**: When inlining into a list item, content shifted —
the first line rendered as a code block or with wrong indent.

**Cause**: The included file started with blank lines (`\n\n`). In list context those blanks broke continuity — markdown-it parsed the following content as a separate block with increased indent (code block).

**Resolution**: In `prepareInlinedContent`, strip leading newlines:
`depContent = depContent.replace(/^\n+/, '')`.

**Files**: `merge-includes.ts` (`prepareInlinedContent`)

---

### Bug 10: Terms do not emit `<dfn>` when `--multiline-term-definitions` is off

**Symptom**: With `--multiline-term-definitions false`, some term definitions did not produce `<dfn>` HTML even though multiline mode worked.

**Cause**: Three related issues in `@diplodoc/transform` term plugin:

1. **Core rule order**: `termReplace` registered `after('linkify')`, i.e.
   **before** `text_join`. When a term definition came from an include file (resolved by the `includes` core rule after inline parsing), `term_inline` could not find the definition and returned `false`. The `*` in `(*key)` was captured by the emphasis parser as a delimiter, splitting `[text](*key)` into multiple text tokens. `text_join`
   merges them back, but it runs **after** `termReplace`.

2. **Regex on split tokens**: `termReplace` scanned each text token separately.
   Regex `\[([^\[]+)\](\(\*(...)\))` could not match a pattern split across tokens →
   `referencedTerms` stayed empty.

3. **`removeUnreferencedDefinitions`** (added for multiline): removed **all** dfn tokens because `referencedTerms` was empty.

**Resolution** (two changes in `packages/transform/src/transform/plugins/term/index.ts`):

1. Move `termReplace` after `text_join`:

   ```typescript
   try {
     md.core.ruler.after('text_join', 'termReplace', termReplace);
   } catch {
     md.core.ruler.after('linkify', 'termReplace', termReplace);
   }
   ```

2. Scan raw inline token content in `collectTermsFromRawContent` as a fallback:
   `inline.content` holds original text without emphasis splitting.

**Files**: `packages/transform/src/transform/plugins/term/index.ts`

---

### Bug 11: Term blocks mis-handled at merge-includes (duplicates, indent, comparison)

**Symptom**: After merge-includes, duplicate term definitions, spurious `__…` suffix keys, or
term-like lines inside indented / list contexts not treated as definitions.

**Cause**: `TERM_DEF_LINE_RE` / extraction did not allow optional whitespace before `[*key]:`
(the same way markdown-it’s term plugin uses `tShift`), and duplicate detection compared raw
blocks without normalizing trivial layout differences.

**Resolution**: Allow `\s*` before `[*…]:` in term line regexes; normalize blocks when comparing;
skip true duplicates in the collector; keep conflict renaming when content differs.

**Files**: `merge-includes.ts` (`extractTermDefinitions`, related helpers)

---

### Bug 12: `#hash` include sections and `notitle` left wrong slice or empty body

**Symptom**: Includes with `#anchor` pulled the wrong range, or `notitle` produced an empty
insert after stripping the only heading line.

**Cause**: `extractSection` ended the slice at the next heading of **any** shallower level,
which disagreed with `findBlockTokens` in `@diplodoc/transform` (section should end only at
the **same** heading level). `stripFirstHeading` could leave only whitespace, which broke
downstream inlining.

**Resolution**: Align `extractSection` termination with `findBlockTokens` (same-level heading
only). If stripping the first heading would leave whitespace-only content, keep the heading.

**Files**: `merge-includes.ts` (`extractSection`, `stripFirstHeading`)

---

### Bug 13: Multiline term bodies with “structured” deps still inlined (YFM009 / broken HTML)

**Symptom**: Linter / transform errors (e.g. YFM009) when a multiline `[*term]:` inlined deps
that contained GFM-style bold-header tables, bold-leading list rows (`- **…` / `* **…`),
or a **nested** `{% include %}` on a separate line from the term label (blockquote / paragraph).

**Cause**: Those patterns are unsafe to paste inline inside a term section; plain inlining
still ran when `canInlineInclude` allowed it.

**Resolution**: Extend `canInlineInclude` / `processTermSectionDeps` so such deps use
`{% included … %}` fallback (`addFallbackDep`) instead of full inlining. Exception: one-line
`[*key]: {% include %}` remains inlined (`termIncludeSharesLineWithTermLabel`).

**Files**: `merge-includes.ts` (`canInlineInclude`, `processTermSectionDeps`, helpers)

---

### Bug 14: Repeated list markers on every inlined line

**Symptom**: Inlining into a list item duplicated `-` / `*` on continuation lines.

**Cause**: `prepareInlinedContent` copied the full `rawPrefix` (including the list marker)
literally for every line when “literal prefix” was chosen too broadly.

**Resolution**: Use the **literal** `rawPrefix` only when it contains structural Markdown
characters `>` (blockquote) or `|` (YFM table row); otherwise keep width with spaces
(list markers are not repeated).

**Files**: `merge-includes.ts` (`prepareInlinedContent`)

---

### Bug 15: Term definitions inside blockquotes not recognized

**Symptom**: Multiline term with include in a blockquote did not get `{% included %}` where
expected; inlining fell back to `<!-- source -->` and broke the intended layout.

**Cause**: `TERM_DEF_RE` / `TERM_DEF_LINE_RE` required `[*key]:` at the start of the logical
line and did not allow optional `> ` prefixes, so `firstTermDefPos` stayed `-1` for lines like
`> [*wrap]:`.

**Resolution**: Prefix pattern `(?:>\s*)*` before `\s*\[\*…` in both regexes so term defs
inside blockquotes match the same definitions as the term plugin.

**Files**: `merge-includes.ts` (`TERM_DEF_RE`, `TERM_DEF_LINE_RE`, callers)

---

### Bug 16: YFM004 `table-not-closed` for `> #|` after blockquoted include

**Symptom**: On real docs (e.g. Webmaster `en/reference/host-id-important-urls.md`), YFM004
**table-not-closed** with context `"> #|"`.

**Cause**: Include directive on a blockquoted line (`> {% include … %}`) made
`prepareInlinedContent` repeat the `>` prefix on continuation lines. The first real table line
in the dep (`#|`) became `> #|`, which YFM does not parse as a valid table opener in that
context.

**Resolution**: If `rawPrefix` contains `>` and the dependency’s first non-empty line opens a
YFM pipe table (`#|`), do **not** apply the blockquote indent to inlined lines (`indent = ''`);
with source maps off, prepend `\n` so the opener is not glued to `>` on one line.

**Files**: `merge-includes.ts` (`depStartsWithYfmTableOpener`, `prepareInlinedContent`)

**Note**: Deliberately **not** supporting a real “YFM `#|` table fully inside a blockquote” via
this path — that layout remains unsupported / author must restructure.

---

### Bug 17: Includes inside YFM shorthand table cells get source maps / indent

**Symptom**: Includes inside YFM shorthand table cells (`||...|{% include %}` or
`{% include %} ||`) produced broken table markup after `md2md` — source map comments
and indentation were added, splitting the table row across multiple lines.

**Cause**: `prepareInlinedContent` always added source map comments and indentation
based on `rawPrefix`, regardless of whether the include sat inside a table cell.

**Resolution**: Detect YFM shorthand table cell context via `isInsideYfmShorthandTableCell`
(checks if `rawPrefix` contains `||` and ends with `|`, or if a `trailingSuffix` is present
indicating a table separator follows the include). In that case, return bare `depContent`
without source maps, indentation, or trailing newlines.

**Files**: `merge-includes.ts` (`isInsideYfmShorthandTableCell`, `prepareInlinedContent`)

---

### Bug 18: Empty resolved include in term definition absorbs subsequent `{% included %}` block

**Symptom**: A term definition `[*dom]: {% include [dom](...) %}` where the include
resolved to empty content (e.g. due to Liquid locale filtering) left `[*dom]:` as a bare
empty stub. The following `{% included %}` fallback block (belonging to a different term)
was visually absorbed into `[*dom]:`'s body, breaking `md2html` rendering — term references
like `[text](*dom)` could not find a valid definition.

**Cause**: `processTermSectionDeps` replaced the `{% include %}` directive with empty
resolved content, leaving the term definition line empty. During final assembly the empty
`[*dom]:` was immediately followed by an unrelated `{% included %}` block which
markdown-it's term plugin parsed as part of `[*dom]:`'s body.

**Resolution**: In `processTermSectionDeps`, when an inlineable include resolves to empty
content (`!resolved.trim()`), preserve the original `{% include %}` directive in the
term definition body instead of replacing it with an empty string. This delegates
resolution to `md2html`, which correctly handles the empty include and produces a
term with an empty description (valid behavior). The `[*dom]:` line is no longer a bare
stub, so it does not absorb subsequent content.

**Files**: `merge-includes.ts` (`processTermSectionDeps`)

---

### Bug 19: Blank lines inside multi-line HTML comments break list/cut/blockquote when indented

**Symptom**: With `--merge-includes`, when an include sits inside a list item / `{% cut %}` /
blockquote (any non-zero indent) and the included file contains a multi-line HTML comment
`<!-- ... -->` with **blank lines inside the comment**, everything that follows the comment
on the page rendered broken: the cut closed prematurely, the list ended early, and JS-bound
widgets after the comment did not initialize. Removing the blank lines from the comment made
the issue disappear; turning `--merge-includes` off also avoided it. Real-world reproducer:
`yateam/lpc/ru/common-info/rules.md` ⇒ `_includes/examples.md` (large `<!-- #|…|# -->` comment
with blank rows between sections).

**Cause**: After inlining, `addIndent()` applied the parent indent to every non-empty line
but **not** to blank lines (intentional, to avoid trailing whitespace). CommonMark says HTML
block type 2 (`<!-- … -->`) is closed only by `-->`, but markdown-it’s list-item parser
treats an unindented blank line inside the HTML block as the boundary of the block: the
remainder of the comment leaks out of the HTML block, gets parsed as Markdown paragraphs,
and the surrounding list / cut / blockquote ends earlier than the author intended. Type-1
blocks (`<style>`, `<script>`, `<pre>`, `<textarea>`) had a fallback (`hasTopLevelHtmlBlock`),
but type 2 (and types 3–5) had no equivalent guard, so they were inlined as-is.

**Resolution**: `addIndent()` now tracks open/close pairs for CommonMark HTML block types
**1–5** and indents blank lines that fall **inside** such an open block (using whitespace
only — no Markdown content is changed). Blank lines outside HTML blocks remain unchanged so
existing snapshots are unaffected. Open/close pairs:

| Type | Open                                            | Close                |
| ---- | ----------------------------------------------- | -------------------- |
| 1    | `<script>` / `<style>` / `<pre>` / `<textarea>` | matching closing tag |
| 2    | `<!--`                                          | `-->`                |
| 3    | `<?`                                            | `?>`                 |
| 4    | `<!XYZ` (declaration)                           | `>`                  |
| 5    | `<![CDATA[`                                     | `]]>`                |

Single-line blocks (open + close on the same line) do not enter the “inside HTML block”
state. After the closing pattern is seen, blank lines stop being indented again.

**Files**: `merge-includes.ts` (`addIndent`, `HTML_BLOCK_OPEN_CLOSE`,
`detectMultilineHtmlBlockOpen`).

**Tests**:

- `merge-includes.spec.ts` (5 unit tests for `addIndent`: type 2 indent, type 1 indent,
  blank lines after comment closes, single-line comment, multiple multi-line comments;
  plus 1 `mergeIncludes` integration test verifying list/cut continuity).
- `tests/e2e/merge-includes.spec.ts` (e2e: `mocks/merge-includes/html-comment-blanks` —
  full md2md cycle with a list + cut + include whose body has a multi-line comment with
  blank lines inside).

---

### Bug 20: `{% include %}` inside fenced code blocks (in lists) was expanded as a real include

**Symptom**: A `{% include … %}` directive shown as a **code example** inside a fenced code
block (e.g. ` ```plaintext ` … ` ``` `) — typical of glossary / syntax docs —
was treated as a real include by the loader and expanded by `--merge-includes`. The original
code example disappeared from the output. Real-world reproducer:
`intranet/idm/internal/concepts/documentation.md` line 25 (a fenced code block at 4-space
indent under an ordered list item, containing `{% include notitle [glossary](...) %}`).

**Cause**: `resolveDependencies` (`src/core/markdown/loader/resolve-deps.ts`) excluded only
HTML comments and `{% included %}` ranges from the include scan. There was no
fenced-code-block exclusion: the existing `INCLUDE_REGEX` matched the directive as if it
were real markup. The pre-existing `\`{% include` guard handles **inline** code spans
(`` `{% include … %}` ``) but not fenced blocks.

**Resolution**: Added `findFencedCodeBlockRanges()` to `resolve-deps.ts` (local, regex
based — no markdown-it parse) and merged its ranges into `exclude` together with comments
and `{% included %}` ranges. The detector recognizes both ` ``` ` and `~~~` fences,
allows arbitrary leading indent (so fences nested inside lists, definition lists, tabs, and
cuts are still detected), respects fence length / character matching for closing fences,
rejects backtick fences whose info string contains a backtick, and conservatively excludes
the rest of the file when an opening fence is not closed.

**Indented (4-space) “code blocks” are intentionally NOT excluded.** Many YFM docs author
include continuations with 4-space indentation under list / definition list / tab / cut
items. `resolveBlockCodes` (which uses markdown-it parsing) cannot tell those apart from
real indented code blocks at top level, so reusing its output here would incorrectly drop
real includes (the existing test `should detect dependencies` covers this scenario).

**Files**: `core/markdown/loader/resolve-deps.ts` (`findFencedCodeBlockRanges`).

**Tests**:

- `loader.spec.ts` — un-skipped `should filter dependencies inside fenced code blocks`,
  added `should filter dependencies inside fenced code blocks indented in lists` (4-space
  fence under `1.`), and `should filter dependencies inside tilde-fenced code blocks`.
- `tests/e2e/merge-includes.spec.ts` (e2e: `mocks/merge-includes/include-in-code-block` —
  fenced code block under an ordered list item with an `{% include %}` shown as code
  must remain unchanged after md2md).

---

### Bug 21: Fence range end collided with the `{% include %}` on the very next line (regression of Bug 20)

**Symptom**: After deploying the Bug 20 fix, ~50 production documentation builds (Yandex
Metrica `support/metrica/common/**/data/get-yclid.md` and similar pages) started reporting
`Include skipped in (…)` and the **first** `{% include %}` placed **immediately** after a
closing ` ``` ` fence (no blank line between fence and include) was no longer inlined — its
directive remained as raw text in the output. Subsequent includes on later lines were
inlined as expected. Reproducer (real file, abridged):

````
…
</script>
```javascript
…
```javascript
…
````

{% include [chat-button](_includes/buttons/chat-button.md) %} ← was dropped
{% include [support-button](…) %} ← was inlined

````

**Cause**: `findFencedCodeBlockRanges()` set the range `end` to `lineStarts[i + 1]` —
i.e. the **start** of the line after the closing fence. The downstream
`filterRanges()` helper in `core/markdown/utils.ts` treats touching ranges as
overlapping (its `contains()` uses non-strict `>=` / `<=` on both endpoints):

```ts
(exclude[1] >= point[0] && exclude[1] <= point[1])
````

So a fence range `[2015, 2833]` and an include match `[2833, 2897]` (the include
starting on the very next line) collided at the boundary `2833`, and the include
was filtered out of `deps`. The dependency loop’s strict `matchStart >= exStart && matchEnd <= exEnd`
check did **not** exclude it (because `matchEnd > exEnd`), but the post-loop
`filterRanges(exclude, includes)` did.

**Resolution**: In `findFencedCodeBlockRanges()`, end the fence range at the **last
character** of the closing-fence line (`lineStarts[i] + lines[i].length`) instead of at the
start of the next line. This keeps the range strictly inside the fence and leaves a
one-character gap (the trailing newline) between the fence range and any directive that
starts on the following line, so `filterRanges` no longer treats them as overlapping.

The deeper issue — `filterRanges` flagging touching ranges as overlapping — was left
unchanged on purpose: it would touch every consumer of the helper (comments, terms,
assets, headings) and risk new regressions in code that intentionally relies on the
inclusive semantics. Fixing the producer’s end value is a strictly local change.

**Files**: `core/markdown/loader/resolve-deps.ts` (`findFencedCodeBlockRanges` end calc).

**Tests**:

- `loader.spec.ts` — `should keep an include that starts on the line right after a closing fence`
  (regression: open ` ```javascript `, body, close ` ``` `, then `{% include %}` on the
  very next line; previously dropped, now in `deps`).
- `tests/e2e/merge-includes.spec.ts` (e2e: `mocks/merge-includes/include-after-fence` —
  full md2md cycle with a fenced code block followed immediately by two `{% include %}`
  directives; both must be inlined in the snapshot).

---

### Bug 22: Unterminated fence opener swallowed every `{% include %}` to EOF

**Symptom**: After Bug 21 was fixed, a second class of pages was reported broken on
internal docs (Yandex Metrika `support/metrica/common/pt/objects/first-party-params.md`,
Yandex Webmaster `support/webmaster/common/ru/search-appearance/images-goods.md`, and
roughly two dozen others): every `{% include %}` placed **after** a malformed or
deeply-indented fence was silently dropped from `deps` — the directive remained as raw
text in the merged output. Two distinct triggers, same downstream effect:

1. **Inline-styled fence with content-like info string and no real closer.**
   Real reproducer (line 51 of `first-party-params.md`):

   ````
   ```javascript ym(XXXXXX, 'firstPartyParams', {
        "e-mail": '…',
        …
   });```
   ````

   Per CommonMark a backtick fence opener allows any non-backtick info string, so the
   first line counts as a valid opener; but the last line ends with `});\`\`\``, which is
**not** a valid closer (a closing fence must consume the entire line bar leading
indent and trailing spaces).  Our detector dutifully reported an unterminated fence
and excluded everything from line 51 to EOF — killing the three real `{% include %}`
   directives at lines 119/121/123.

2. **Deflist marker on the same line as a fence opener.** Real reproducer in
   `images-goods.md`:

   ````
       :   ```          ← real opener (deflist marker + fence on same line)
           <html>…
           ```          ← real closer
           ```          ← next real opener
           …
           ```          ← next real closer
   ````

   `findFencedCodeBlockRanges` is regex-based and trims arbitrary leading whitespace.
   The line `:   \`\`\``starts with`:`, so the regex does not match — the **real
opener is missed**.  The detector then mistakes the next ` `` ` line (the real
closer) for a fresh opener, pairs it with the line after it (real opener of the
next fence) as a (harmless but wrong) [closer→opener] range, and finally treats
the last ` `` ` of the second fence as another fresh opener that never gets
   closed. Same downstream effect: every include after that is excluded to EOF.

**Cause**: `findFencedCodeBlockRanges` had a final branch that, on encountering an
opener with no matching closer, pushed `[openerLineStart, content.length]` into the
exclude list. The intent was conservative — “better to incorrectly resolve includes
that are inside a malformed code block than to leak fence content into deps”. In
practice the opposite trade-off matters in real docs: malformed fences are common, the
content after them is real markdown, and dropping every real include below them
breaks ~50 pages.

**Resolution**: Remove the unterminated-opener branch entirely. When an opener has no
matching closer, the function now adds **no** range for it — the rest of the file is
scanned normally for `{% include %}` directives. The worst residual case is an
include inside a genuinely unclosed code fence being incorrectly merged; in real
content that scenario is essentially always a malformed file already.

The detector is still regex-based and intentionally simple. A markdown-it-driven
fence detector (mirroring `resolveBlockCodes`) would handle the deflist case
precisely, but at the cost of an extra parse on every file the loader sees; we only
need to make sure no real include is silently dropped, and the conservative “no range
on unterminated” is sufficient for that.

**Files**: `core/markdown/loader/resolve-deps.ts` (`findFencedCodeBlockRanges` —
removed the EOF-fallback push, kept the matched-pair logic and the head comment now
documents the trade-off).

**Tests**:

- `loader.spec.ts` — `should keep includes after an unterminated \`\`\` opener with content-like info string`(case 1:` \`\`\`javascript ym(...{ ` opener, no valid closer, three real includes after).
- `loader.spec.ts` — `should keep includes when a fence is mis-paired in deeply indented deflist context`
  (case 2: deflist marker `:   \`\`\``on the same line, two indented fences, includes
inside and after the deflist body must all land in`deps`).
- The Bug 20 e2e (`mocks/merge-includes/include-in-code-block`) and the Bug 21 e2e
  (`mocks/merge-includes/include-after-fence`) continue to pass — proper paired
  fences still exclude their includes correctly.

---

### Bug 23: stray `|` rendered in YFM shorthand cell when an inlined include ends with an HTML block

**Symptom**: After Bug 22 was fixed, a Yandex Metrica `pro/price.md` page rendered an
extra literal `|` character at the end of two YFM shorthand table cells:

- Source: `support/metrica/common/en/pro/price.md` — each cell ends with
  `… {% include [list-button|sub-button] … %}||` and the included files
  (`list-button.md`, `sub-button.md`) end with a nested
  `{% include [href-to-button] … %}` whose content is a multi-line `<style>…</style>`
  HTML block.
- After merge the produced md (`md-with-merge-includes/en/pro/price.md`) had
  `</style>||` glued onto a single line as the last line of the cell.
- The `md-with-merge-includes` HTML output contained `</style>|</td>` (a stray `|`),
  while the `md-without-merge-includes` HTML — where the include is expanded later
  by markdown-it’s include plugin — produced clean `</style></td>`.

**Cause**: The bug is in the `markdown-it` ↔ `@diplodoc/transform` table plugin
interaction, not in the merge plugin per se. Inside a YFM shorthand row the
table plugin overrides `state.eMarks[end.line] = end.pos` (where `end.pos` is the
position of the **first** `|` of the closing `||`) before re-tokenizing the cell.
The `getLines()` helper used by the HTML-block rule reads
`this.eMarks[line] + 1` — i.e. one extra character past the override — so the
HTML-block content captures a single trailing `|` whenever its closing tag sits on
the same line as the `||` row terminator.

The merge-includes plugin cannot fix `markdown-it`/`yfm-table` directly, but it can
**avoid producing the colliding layout** in the first place. Bug 23 is therefore a
content-shape bug: the inlined content ended with `</style>` and `getTrailingSuffix`
re-attached the `||` on the same line because `prepareInlinedContent` returned
`depContent` exactly as-is for shorthand-table cells.

**Resolution**: When an include is followed by a YFM shorthand separator
(`||` / `|#`) on the same line and the inlined content is non-empty, ensure the
inlined content ends with a newline. Concretely, in
`output-md/plugins/merge-includes.ts:prepareInlinedContent`, the early-return
branch for `isInsideYfmShorthandTableCell(rawPrefix, trailingSuffix)` now appends a
`\n` whenever `trailingSuffix` is set and `depContent` does not already end with one.
The `inlineActor` then splices the inlined content with the original line tail, so
`||` (or `|#`) lands on its own line. Verified end-to-end via
`@diplodoc/transform`: `</style>\n||` renders cleanly as `<style>…</style></td>`.

**Files**: `commands/build/features/output-md/plugins/merge-includes.ts`
(`prepareInlinedContent`).

**Tests**:

- `merge-includes.spec.ts` (unit) — `should bare-inline include followed by YFM
table separator (trailingSuffix)` updated to assert the trailing newline (single
  source of truth for the new contract).
- `tests/e2e/merge-includes.spec.ts` — new test
  `yfm-table: include ending with HTML block places || on its own line` with mock
  `mocks/merge-includes/yfm-table-html-block` (button include with nested `<style>`
  HTML block followed by `||` on the source line; snapshot now shows `</style>` and
  `||` on separate lines).
- The pre-existing `yfm-table: include followed by || separator is inlined`
  snapshot is updated accordingly: simple inline content (a link) is also placed
  before a `||` on its own line. Both shapes parse identically through
  `markdown-it`/`yfm-table` (verified by repro), so this is a strict improvement.

---

### Bug 24: `|` inside inlined content split YFM shorthand cells

**Symptom**: After Bug 23 was fixed, Yandex Metrica `general/goal-js-event.md`
rendered the “regular expression” row of a YFM shorthand table broken in half:
the cell that should have contained the inline code `` `button|buy` `` was
split at the `|` character, producing an extra `<td>` for the second half
(`buy``).` and a stray backtick. In the `md-without-merge-includes` build
the same source rendered correctly because the table cell still contained
the `{% include %}` directive (no `|` characters in the cell at parse time)
and the include was expanded later by the markdown-it includes plugin.

Reproduced minimally with `@diplodoc/transform`:

```md
#|
||
**A**|**B**
||
||
**regular expression**
|
{% cut "Example" %}

If you want to track the IDs that contain `button` or `buy`,
specify the condition: `button|buy`.

{% endcut %}
||
|#
```

Output (truncated):
`<code>buy</code>, you can specify the condition: \`button</p></div></details></td><td><p>buy\`.</p></td>`— the cell ends mid-content because`|` was treated as a cell separator.

**Cause**: This is a **pre-existing** YFM-table parser behavior, **not**
something introduced by merge-includes. The parser walks each table region
character by character looking for `|` (cell separator) and `||` (row
separator). By default it does **not** skip inline-code spans:
`opts.table_ignoreSplittersInInlineCode` is `@default false` in
`@diplodoc/transform/lib/plugins/table` and the CLI does not override it. Any
bare `|` inside a cell — whether in code, in HTML, in a regex literal, or in
a math span — is interpreted as a column separator.

In `md-without-merge-includes` mode this was never a problem because the cell
content stays as `{% include [...] %}` and only contains pipe characters in
the _resolved_ content, which the table parser never sees. In
`md-with-merge-includes` mode the resolver inlines that content into the cell
and the bare `|` reaches the table parser, breaking the layout.

The fix cannot be in `markdown-it`/`yfm-table` (changing the default would be
a breaking change for every consumer), so it must be in `mergeIncludes`:
**refuse to inline an include into a YFM shorthand cell when the include’s
transitive content carries a bare `|`**, and use the `{% included %}` fallback
instead. The fallback keeps the directive in place inside the cell (no `|`
in the cell at parse time) and emits the resolved content as `{% included %}`
at the end of the file, where md2html resolves it normally — matching the
`md-without-merge-includes` output exactly.

**Resolution**: Two helpers in
`commands/build/features/output-md/plugins/merge-includes.ts`:

- `isInsideYfmShorthandTable(parentContent, depStart)` — line-by-line scan
  that balances `#|` openers and `|#` closers above the include’s position;
  returns `true` while the running depth is positive. Recognises
  `#|` (with optional `{...}` attribute block on the same line) at line
  start as the opener and a bare `|#` line as the closer, matching how
  `@diplodoc/transform` detects YFM shorthand tables.
- `depTransitiveContentHasPipe(dep)` — DFS over the dep graph
  (`dep.deps`, deduplicated by `path`) checking `contentWithoutFrontmatter`
  for any `|` character. Conservative on purpose: false positives only
  push an include into the fallback path (functionally equivalent at
  md2html time), false negatives would silently break the cell.

`canInlineInclude` now returns `false` when both helpers return `true`,
so `addFallbackDep` is invoked for that dep instead of inlining.

**Files**: `commands/build/features/output-md/plugins/merge-includes.ts`
(`canInlineInclude`, plus the two helpers).

**Tests**:

- `tests/e2e/merge-includes.spec.ts` — new test
  `yfm-table: include with \`|\` in inline code falls back to {% included %}`with mock`mocks/merge-includes/yfm-table-pipe-in-content`(a`goal-js-event.md`-shaped table where the cell wraps `{% cut %}` around an
include containing `` `button|buy` ``).  Snapshot confirms the directive
stays inside the cell and the resolved content is appended as a `{% included (_includes/example.md) %}` block.
- All earlier yfm-table mocks (`yfm-table`, `yfm-table-html-block`) keep
  inlining as before — their included content has no `|` characters, so
  `depTransitiveContentHasPipe` returns `false` and the existing snapshots
  are unchanged.

**Caveat**: The opposite combination — an include whose content has no `|`
but which sits inside a YFM cell that itself uses `||` row separators on
adjacent lines — is unaffected; the YFM table parser sees those `||` at
expected positions and they are not within the include’s replaced range.

---

### Bug 25: ` ``` |` (fence + YFM cell separator on the same line) was rejected as a closer

**Symptom**: Yandex browser-corporate `ru/policy/cookies-allowed-for-urls.md`
(and the parallel `cookies-blocked-for-urls.md`) emitted an avalanche of
`ERR Include skipped in (...). Include source for ... not found` errors for
every reusable include in the **Linux**/**macOS** tabs (`use-url-patterns.md`,
`asterisk-brackets.md`, `punycode.md`, `settings-via-file.md`,
`value-example.md` — 9–17 entries per page). The same includes inside the
**Windows** tab resolved fine.

The structural difference between the working and broken tabs was a single
line: the broken tabs use the YFM-table idiom of closing a fenced code block
on the same line as a shorthand cell separator, e.g.

````
  ```json
  "CookiesAllowedForUrls": ["URL1"]
  ``` |
  - text outside the code block
````

with another, unrelated ` ``` … ``` ` block further down the cell.

**Cause**: `findFencedCodeBlockRanges` (in
`core/markdown/loader/resolve-deps.ts`) treats a closing fence strictly per
CommonMark: the closing run must be followed only by whitespace. The line
` ``` |` carries `|` after the fence run, so it failed the `after === ''`
check and was **not** counted as a closer. The opener on the previous
` ```json ` line therefore stayed open, and the next real ` ``` … ``` ` pair
in the same tab/cell was paired with the original opener — producing one
gigantic phantom code range that swallowed every `{% include %}` between
them. Those includes never reached the dependency graph, so md2html later
reported them as missing.

The strict `after === ''` rule was correct for Bug 22's deflist case (where
unclosed openers must not extend to EOF), but it does not match how YFM
authors close fenced blocks inside shorthand-table cells. CommonMark itself
would not accept ` ``` |` as a closer either, but the whole construct
(`#|…|#`) is YFM-specific and the markdown-it pipeline running on the
final document _does_ render the block correctly: it leaves the fenced
block closed on that line and treats the trailing `|` as the cell
boundary.

**Resolution**: Relax the closer detection in `findFencedCodeBlockRanges`
to also accept `|`, `||`, or `|#` (with optional whitespace) after the
fence run. The check is intentionally narrow — only the three YFM
shorthand-table separators are allowed; arbitrary text after the fence
still fails so we don't accidentally pair a real opener with junk on a
random line. With the relaxed rule, ` ``` |` is recognised as the
closer of the surrounding code fence, the next fence pair is detected
on its own merits, and the includes between them stay in the dep graph.

**Files**: `core/markdown/loader/resolve-deps.ts`
(`findFencedCodeBlockRanges` — the closer's `after` check now matches
`/^(?:\|\||\|#|\|)$/` in addition to `''`).

**Tests**:

- `core/markdown/loader.spec.ts` — new
  `should treat a \`\`\` | line as a valid closer (YFM table cell separator
  after fence)`. Builds a YFM shorthand cell with a ` `json … ` |`block,
two`{% include %}`s after it, then another ` `json … ` `block,
closed by`||`and`|#`. Asserts both includes are in `deps` and the
  loader returns the source unchanged.

---

### Bug 26: fence runs inside an HTML comment paired across the comment boundary

**Symptom**: Yandex Yateam `datasync/http/ru/dg/concepts/data-structure.md`
emitted `ERR Include skipped in ...` for every include in the
**“Запись” / “Поля записи”** sections (`record-id.md`, `collection-id.md`,
`revision.md`, `fields.md`). The same includes were authored as
`:   {% include … %}` deflist bodies between two real code blocks — and
above the deflist the document carried an HTML comment that contained a
sample fenced code block:

````
<!-- ```javascript
// example
``` -->

#### record_id
:   {% include [record-id](./_includes/record-id.md) %}
…
```javascript
// real code
````

`````

**Cause**: `findFencedCodeBlockRanges` walks line by line and is unaware of
HTML block context. The `<!--` line itself is not a fence (it doesn't start
with backticks after trim), so the opener on the next line (`” ```javascript ”`)
was missed. But the comment closer ` ``` --> ` _was_ matched: trimmed it
becomes ` ```` followed by `-->`, and Bug 22's "no EOF extension" rule made
us read it as a fresh opener with info string `-->`. The next real
` ``` ` line later in the document then closed it, producing a code range
that spanned the deflist with all four includes inside.

The detector cannot reliably "fix" itself with line-by-line heuristics —
HTML block boundaries depend on the comment context that only a real parser
tracks. But `resolveDependencies` already gathers HTML comments into
`this.api.comments.get()` and excludes them from include scanning. The
same comment ranges should also blind the fence detector: any line whose
start position lives inside a comment cannot be a fence boundary, since
markdown-it never sees those lines as a code block (the surrounding HTML
block consumes them as raw HTML).

**Resolution**: Pass the comment ranges to `findFencedCodeBlockRanges`
explicitly. Inside the loop a `lineIsExcluded(i)` check skips any line
whose `[lineStart, lineEnd]` is contained in one of the supplied ranges,
so fences inside HTML comments neither open nor close real fence ranges.
The phantom range vanishes, and the deflist includes stay in deps.

**Files**:

- `core/markdown/loader/resolve-deps.ts`:
  - `findFencedCodeBlockRanges(content, excludeRanges = [])` accepts an
    optional list of ranges to ignore.
  - `resolveDependencies` now caches `this.api.comments.get()` once and
    passes it both to the `exclude` list and to `findFencedCodeBlockRanges`.

**Tests**:

- `core/markdown/loader.spec.ts` — new
  `should not treat fence runs inside an HTML comment as a real fence`.
  Builds a doc with `<!-- ```javascript … ``` --> ` followed by two deflist
  `:   {% include … %}` lines and a real code fence. Asserts that both
  deflist includes are in `deps` and loader output is unchanged.

**Cross-fix interaction**: Bug 22's "drop unterminated openers" rule
remains in place; Bug 26 only narrows _which_ lines can open or close a
fence in the first place. The combination handles all three failure modes
seen so far: unterminated fences (Bug 22) no longer extend to EOF, real
fence runs adjacent to YFM cell separators are paired correctly (Bug 25),
and runs inside HTML comments are ignored entirely (Bug 26).

---

### Bug 27: indent at parent + indent inside include promotes paragraph to indented code block

**Symptom**: Yandex direct-pro
`en/_includes/fixed-cpm-campaigns/product-yandex-services/requirements-mediaservices/id-requirements-mediaservices/100-180.md`
authored a normal paragraph at column 2 inside an otherwise un-listed
section (the surrounding numerals were escaped: `1\.`, `2\.`, `3\.`),
e.g.

```md
3\. The banner must stretch to 100% of the screen width…

  Значение ширины баннера `width` задается в процентном формате — 100%.

4\. All elements must have fixed dimensions…
`````

In `md-without-merge-includes` mode that line renders as a regular
paragraph: leading 2 ≤ 3 spaces, no container active, CommonMark keeps
it inline. In `md-with-merge-includes` mode the directive in the parent
(`requirements-mediaservices.md`) sat at 4-space `rawPrefix`:

```md
- 100% × 180 banner in the mobile site version.

  {% include [100-180](.../100-180.md) %}
```

After merge each line of the include picked up that 4-space prefix, so
the 2-space paragraph became a 6-space line. Inside the surrounding
tab item `- 100% × 180 banner` (continuation indent = 2), 6 − 2 = 4
extra columns — exactly the CommonMark threshold for an indented code
block. The paragraph silently rendered as a code sample in the merged
output, breaking visual parity with the no-merge baseline.

**Cause**: There is no syntactic conflict here — this is a legitimate
property of CommonMark indented code blocks. The merge plugin can't
"normalise" leading whitespace inside includes: doing so would break
includes that intentionally use indented continuations or
4-space-indented code blocks. The only safe response is to detect the
risk and fall back to `{% included %}`, which keeps the directive in
its original place and emits the dep content as a separate appendix
block where md2html resolves it normally — matching the no-merge
output exactly.

**Resolution**: Two helpers in
`commands/build/features/output-md/plugins/merge-includes.ts`:

- `indentedIncludeRisksParagraphCodeBlock(dep, rawPrefix)` — only fires
  when `rawPrefix` is whitespace-only and computes
  `threshold = max(1, 4 - rawPrefix.length)`. When `threshold > 3` the
  parent prefix alone already provides the merged indent (paragraph
  stays a paragraph), so the check exits. Otherwise it DFS-walks the
  dep graph (deduped by `path`) and runs `hasIndentedTopLevelParagraph`
  on each transitive content.
- `hasIndentedTopLevelParagraph(content, threshold)` — line-by-line
  scan with a small container stack:
  - skips fenced code blocks (any `1–3` spaces of indent inside a fence
    is irrelevant — markdown-it sees them as code regardless);
  - skips YFM shorthand tables (`#|…|#`) — table cells are parsed
    differently and don't acquire the merge prefix in a way that would
    promote indent to code blocks;
  - pushes a frame on real CommonMark containers (`-`/`*`/`+` /
    `\d+.` / `\d+)` list markers, `>` blockquote, `:   ` deflist body)
    and pops them only after a blank line when the next line's leading
    drops below the frame's continuation indent;
  - does NOT push on YFM directives (`{% note %}`, `{% cut %}`,
    `{% list %}`, etc.) — those don't add continuation indent in source
    markup, so paragraph lines inside them count as top-level for our
    check;
  - flags the first line whose leading is in `[threshold, 3]` while the
    container stack is empty.

`canInlineInclude` calls the helper after every other inlinability
check; on `true` the dep is routed through `addFallbackDep`.

**Files**:

- `commands/build/features/output-md/plugins/merge-includes.ts`
  (`canInlineInclude`, plus `indentedIncludeRisksParagraphCodeBlock` and
  `hasIndentedTopLevelParagraph`).

**Tests**:

- `commands/build/features/output-md/plugins/merge-includes.spec.ts` —
  new `describe('indented top-level paragraph in dep content (Bug 27)',
…)` block under `describe('canInlineInclude', …)` covering:
  - 4-space parent prefix + 2-space paragraph in dep (rejected);
  - transitive sub-include carrying the indented paragraph (rejected);
  - real list with lazy continuation (allowed: stack catches it);
  - parent prefix 0 (allowed: no merge regression possible);
  - dep with no leading indent on any paragraph (allowed);
  - 2-space prefix + 2-space paragraph (rejected);
  - 2-space prefix + 1-space paragraph (allowed: 2 + 1 < 4);
  - leading spaces inside a fenced code block (allowed: already code);
  - leading spaces inside a YFM shorthand cell (allowed: cell-parsed).
- `tests/e2e/merge-includes.spec.ts` — new e2e
  `indent-paragraph: include under indent with indented top-level
paragraph falls back to {% included %}` with mock
  `mocks/merge-includes/indent-paragraph-in-include`. Snapshot confirms
  the parent keeps the `{% include %}` directive inside the tab item
  and the dep content is appended as an `{% included
(_includes/requirements.md) %}` block at the end of the file.

**Caveats**:

- The check is intentionally conservative: edge cases around lazy
  continuations after blank lines may produce false positives, which
  routes those includes through the safe fallback. False negatives
  (missed regressions) are the only real harm and the structural rules
  above avoid them in the patterns observed in real docs.
- An include that is _completely_ at column 0 in source and lives under
  a parent prefix ≥ 4 won't trip the check (`leading > 0` filter). This
  matches reality: a directive at `≥ 4`-space `rawPrefix` is normally
  inside a container whose own continuation indent equals the prefix,
  so a 0-leading content line aligns with that continuation.

---

### Bug 28: end-of-line ` ```|| ` inside a YFM shorthand-table cell is not recognised as a fence closer

**Symptom**: Yateam `alice-dev-guide/concepts/test-integration.md` and
`test-functional.md`. The shorthand-table cells use a non-canonical
fence shape — opener ` ``` ` on its own line, closer glued onto the
last content line together with the cell separator
(`  platform: 'telegram' ```||`):

```md
||`app_info` | … |
```

app_info:
app_id: 'telegram'
platform: 'telegram' ```||
||`device_state` | …

{% include [ins-n-outs](.../ins-n-outs.md) %}

| `device_state:
   sound_level: 5`||

````

The fence opener on the standalone ` ``` ` line was detected, but the
closer hidden at the end of `   platform: 'telegram' ```||` was not
(our scanner only recognised closers at the START of a line). The
opener stayed open, eventually getting paired with a much later real
` ``` ` opener — so every `{% include %}` in between landed inside a
phantom fence range and was reported as `Include skipped`.

**Cause**: `findFencedCodeBlockRanges` in `core/markdown/loader/resolve-deps.ts`
checks for closers via `^( ``` |~~~)` on the trimmed line. CommonMark
forbids non-whitespace before a closer, so this is correct in pure CM,
but YFM authors routinely glue the YFM-table cell separator onto the
same line as the closing fence. Markdown-it inside a table cell still
ends the code block on that line; our scanner did not.

**Resolution**: After failing the start-of-line closer check inside an
open fence, also test the raw line against
`/( ``` {3,}|~{3,})\s*(?:\|\||\|#|\|)\s*$/`. The regex matches a
` ``` ` (or ` ~~~ `) run sitting at the END of the line followed by a
YFM separator (`||`, `|#`, or `|`) and only whitespace before the line
break. The match must agree with the open fence char + length so a
` ~~~ ` run never closes a backtick fence.

**Files**:

- `core/markdown/loader/resolve-deps.ts` — `findFencedCodeBlockRanges`
  (`END_CLOSE_RE` + closer logic restructured into separate
  start-of-line / end-of-line passes).

**Tests**:

- `core/markdown/loader.spec.ts` — `should treat ``` glued to end of
  content line with YFM separator as a closer`. Sets up a YFM
  shorthand table where two cells use the glued-closer pattern around
  two `{% include %}` directives, and asserts both deps survive.

**Caveats**:

- The end-of-line closer rule is gated behind an active opener
  (`openLine >= 0`) and behind char/length agreement, so a stray
  ` ``` || ` inside a real code block cannot conjure a phantom closer.
- A code block whose content legitimately ends with ` ```|| ` (very
  rare — would have to be documentation that prints YFM shorthand
  syntax verbatim) will be closed prematurely. The worst-case
  consequence is a real `{% include %}` written as code being expanded
  as an actual include below the false closer; given how unusual the
  pattern is, this is an acceptable trade.

---

### Bug 29: ` ``` ` glued after a deflist `:` or list-item marker is not recognised as a fence opener

**Symptom**: Two patterns reported in real docs:

1. Yandex Games `dev/rosreestr-games/ru/rosreestr-games-use/rosreestr-games-use.md`
   — definition-list bodies that hold examples use the canonical YFM
   form
   ```md

   :   ```javascript
       …
       ```
````

followed later by a top-level

````md
{% include [auth](_includes/.../auth.md) %}

```javascript
…
```
````

````
The deflist opener was missed (line starts with `:`), so the inner
` ``` ` closer was mistaken for a fresh opener and paired with the
later top-level ` ```javascript ` — swallowing the include between
the two top-level fences.
2. CatBoost-style list pattern (user-reported):
```md
- ```
    per_float_feature_quantization=['0:1024']
    ```

    {% include [borders](.../feature_borders.md) %}

    The next example is equivalent:

    ```
    per_float_feature_quantization=['0:border_count=1024']
    ```
````

`- ``` ` is a list item that _contains_ a fence opener. Our scanner
ignored the line because it starts with `-`, then paired the inner
closer with the next list item's opener, eating the include in the
middle.

**Cause**: `findFencedCodeBlockRanges` looked for openers via
`^( ``` |~~~)` on the trimmed line — without considering that
markdown-it allows a fence opener to sit on the same line as a list
bullet (`-`/`*`/`+`/`\d+[.)]`) or a definition-list body marker
(`:` + spaces). These container kinds are **asymmetric**: the matching
closer ` ``` ` is rendered at the continuation indent (no bullet, no
`:`), so the strip is safe to apply only on the opener side.

(Blockquote `>` is structurally _symmetric_ — the closer line also
carries `>`. An earlier draft of this fix included `>` in the
container-prefix list; that introduced Bug 30 and was reverted. See
Bug 30 for the full asymmetry analysis.)

**Resolution**: Add `stripContainerPrefix(s)` and apply it ONLY when
looking for an opener (`openLine < 0`). The helper strips at most one
leading list / deflist marker so the fence regex can match the rest of
the line. Closer detection still operates on the raw trimmed line,
because once we're inside a fenced block, markdown-it consumes
container markers literally as code content (stripping them on the
closer pass would let `- ``` ` inside a real code block falsely
terminate the outer fence).

**Files**:

- `core/markdown/loader/resolve-deps.ts` — `findFencedCodeBlockRanges`
  (`stripContainerPrefix` + asymmetric opener / closer scan).

**Tests**:

- `core/markdown/loader.spec.ts`:
  - `should treat ``` glued after a deflist ":" marker as an opener` —
    the rosreestr-games shape;
  - `should treat ``` glued after a list-item marker as an opener` —
    the CatBoost shape (verifies the user-reported snippet).

**Caveats**:

- Only one layer of container prefix is stripped. Deeper nesting
  (`1. - ``` `, etc.) would miss the opener, which is harmless — the
  worst-case outcome is missing a fence range, i.e. an `{% include %}`
  written as code inside that deeply nested fence could be expanded as
  a real include. Real docs do not seem to use such patterns.
- Blockquote (`>`) is intentionally excluded from this stripping — see
  Bug 30 for the reasoning.

---

### Bug 30: blockquote-wrapped fence created phantom ranges and swallowed real includes (regression of Bug 29)

**Symptom**: Five real-world docs lost include directives entirely (the
loader stopped recognising them as includes — they were emitted to the
HTML stage as-is and reported as `Include skipped in …`):

1. Tracker `support/tracker/common/ru/api-ref/filters/create-filter.md`
   line 142.
2. Forms `support/forms/common/ru/send-request.md` line 182.
3. Webmaster `dev/webmaster/en/reference/host-verification-get.md`
   lines 90, 93, 96, 99 (four includes).
4. XML `dev/xml/ru/concepts/response.md` line 224.
5. User-reported pattern (sky-list):
   ````md
   > {% include [cmd](_includes/…/the-following-command.md) %}
   >
   > ```
   > sky ping G@ws40-055 G@ws40-004
   > ```
   >
   > {% include [ans](_includes/…/the-following-answer.md) %}
   ````

In every case the document contained a fenced code block inside a
blockquote (e.g. ` > \`\`\`json … > \`\`\` `) followed later by a
top-level fence (` \`\`\`json … \`\`\` `).

**Cause**: The Bug 29 patch added `>` to `stripContainerPrefix` so that
` > \`\`\`json ` would be recognised as a fence opener. But the patch
applied the strip ONLY in the opener branch (`openLine < 0`), reasoning
that closer detection should not strip prefixes (to avoid the Bug 22
class of regressions where ` - \`\`\` ` text inside an outer code block
is mistaken for a closer).

That reasoning is correct for list-item and definition-list openers,
which are **asymmetric** (closer is rendered as ` \`\`\` `at the
continuation indent — no bullet, no`:`marker). It is wrong for
blockquote: a fence inside a blockquote is **symmetric** — markdown-it
parses every line of the blockquote as having a`> `prefix, so both
the opener`> \`\`\``and the closer`> \`\`\`` carry it.

The one-sided strip therefore detected the blockquote-fence opener,
then never matched its real closer (still starts with `>` after
`trimStart`). The fence stayed open until the next downstream
top-level ` \`\`\` `showed up — which then closed a phantom range
that contained every`{% include %}` directive between them.

**Resolution**: Remove `>\s+` from `stripContainerPrefix`. Document
the asymmetry explicitly. We accept that blockquote-wrapped fenced
code blocks are no longer detected by the scanner (the opener `> \`\`\``just looks like blockquote text, the closer too). The only cost is
that an`{% include %}` directive shown as code **inside** a
blockquote-wrapped fenced code block would be wrongly expanded as a
real include — a pattern that has not been observed in any real doc
set we audited.

Symmetric `>` stripping (on both opener and closer) was considered
and rejected:

- It re-introduces a Bug 22-style risk: a ` > \`\`\` ` line that
  happens to live as text content inside an outer fenced code block
  would be mistaken for a closer and terminate the outer fence
  prematurely.
- Nested blockquotes (` > > \`\`\` `) would need recursive stripping —
  more code, more edge cases.
- Removing the strip simply restores the pre-Bug-29 behaviour for
  blockquote-fences (i.e. they are invisible to our scanner). This is
  the _minimum_ code change consistent with the principle "false
  negatives (fence not detected, harmless in 99% of docs) are
  preferable to false positives (phantom range swallows real
  includes)".

**Files**:

- `core/markdown/loader/resolve-deps.ts` — `stripContainerPrefix` no
  longer matches `^>\s+`. Comment block updated to record the
  asymmetry argument so future contributors don't re-add it.

**Tests**:

- `core/markdown/loader.spec.ts` — four new tests under the existing
  `describe(' ``` fence detection inside markdown', …)` block:
  - `should NOT treat ``` opener glued to a blockquote ">" marker as
a fence opener` — minimal repro (two blockquote-fences plus a
    later top-level fence around an `{% include %}`).
  - `should NOT treat ``` opener glued to a blockquote with extra
indent (">   " + ```)` — forms send-request.md shape with
    `>   ```json … >    ``` ` and a top-level fence after the
    include.
  - `should keep all includes between two blockquote-wrapped fences
and a later top-level fence` — webmaster host-verification-get.md
    shape (four adjacent top-level includes between blockquote-fences
    and a later top-level fence).
  - `should keep two adjacent blockquote-wrapped includes around a
blockquote-wrapped fence` — user-reported sky-list pattern.

**Caveats**:

- An `{% include %}` written as code inside a blockquote-wrapped
  fenced code block will be wrongly expanded. Mitigation: documentation
  that needs to show an include literally inside a blockquote can
  either drop the blockquote wrapper, escape the directive
  (`{% raw %}{% include %}{% endraw %}`), or wrap the example in a
  top-level fence — all three are already idiomatic for showing YFM
  syntax verbatim.
- The Bug 29 fix for list (`- \`\`\``) and deflist (`: \`\`\``)
  openers remains in place — those markers are structurally asymmetric
  (no marker on the closer), so the one-sided strip is correct there.

---

### Bug 31: empty-resolving include silently drops the next sibling include (different root cause, separate from the fence scanner)

**Symptom**: In static `html-without-merge-includes` builds (`md2md` → `md2html` on the merged tree), some pages rendered a literal, JSON-escaped placeholder right where an include should have appeared:

```
< path="../../_includes/reusables/neuroexpert-button.md" keyword="notitle">
```

In the alice doc set this affected **627 HTML files**. The list of "broken" include source files was tiny (three files: `neuroexpert-button.md`, `mini-toc.md`, `border-none.md`) and all three contained only an HTML / CSS block with no markdown — the property that made them stand out was actually that their _preceding_ include resolved to zero tokens.

**Two failure modes that produce an empty include token stream**:

1. `{% include notitle [x](file.md#anchor) %}` where the section under `#anchor` is just the heading line (no body). `cutTokens` returns the three heading tokens, `stripTitleTokens` removes them, the result is `[]`. Surfaced on `ru/ambient-lamp/_includes/reusables.md#quick-notifications`.
2. A non-notitle include whose body is entirely wrapped in `{% if locale == … %}` blocks none of which match the current locale. After liquid expansion the file body is whitespace, `md.parse` returns `[]`. Surfaced on `uz/station/_includes/reusables/id-feedback/feedback-plus_chat.md` (only `ru`/`en`/`ar` branches; locale `uz` evaluates to empty).

**Root cause (a)**: [`src/core/utils/markdown.ts:filterTokens`](../src/core/utils/markdown.ts) advanced the index after a handler's `splice(index, 1, …)` by `index += skip - 1` only when `skip` was truthy. For `skip === 0` (handler removed the visited token, replacing it with zero tokens) the correction was suppressed by `if (result?.skip)`, and the outer `for`-loop's `index++` walked **past** the token that had just shifted into `tokens[index]`. If the shifted-in token was another `include`, the [`includes`](../src/commands/build/features/output-html/plugins/includes.ts) plugin never visited it — the synthetic include token (created by [`includes-detect`](../src/commands/build/features/output-html/plugins/includes-detect.ts) with empty `tag = ''`) survived into the render phase and markdown-it's default `renderToken` rendered it as `< path="…" keyword="…">`.

**Fix (a)**: check `typeof result?.skip === 'number'` so that `{skip: 0}` is honoured. The semantics are now: `skip` is the number of replacement tokens; the outer `++` is correctly compensated for `0`, `1`, and any `N`.

**Root cause (b) — md→md asymmetry**: [`stripFirstHeading`](../src/commands/build/features/output-md/plugins/merge-includes.ts) (used by `mergeIncludes`) had a defensive fallback that returned the **original** content (heading included) when stripping the heading would leave a whitespace-only result. The intent was to avoid a "vanishing include" in the merged markdown, but the effect was: a `{% include notitle %}` on a section whose only line was the heading produced `# Heading` in `md2md` and produced **nothing** in `md2html`. The two paths must agree.

**Fix (b)**: removed the fallback. `stripFirstHeading('# Only Heading')` now returns `''`, matching `stripTitleTokens([heading_open, inline, heading_close]) → []`. The author wrote `notitle`; the directive wins.

**Regression coverage**:

- [`src/core/utils/markdown.spec.ts`](../src/core/utils/markdown.spec.ts) — direct unit tests on `filterTokens` for `skip = 0`, chained zero-splices, and mixed skip values.
- [`src/commands/build/features/output-html/plugins/includes.spec.ts`](../src/commands/build/features/output-html/plugins/includes.spec.ts) — three end-to-end cases reproducing the alice failure modes (notitle + empty section; empty file body; middle-of-three includes empty).
- [`src/commands/build/features/output-md/plugins/merge-includes.spec.ts`](../src/commands/build/features/output-md/plugins/merge-includes.spec.ts) — `stripFirstHeading` now returns empty for `# Only Heading` and for `#### Heading {#anchor}`.
- End-to-end check on the alice doc set: 627 → **0** files containing `&amp;lt; path=` placeholders after the fix.

**Why the viewer was never affected**: the viewer uses [`@diplodoc/transform/lib/plugins/includes`](../../transform/src/transform/plugins/includes/index.ts), which is hand-written with `while (i < tokens.length) { … i += includedTokens.length; }`. When `includedTokens.length === 0`, `i` stays put and the next token is processed naturally. Plus, on resolution failure that plugin leaves the **original `{% include %}` text** (not a synthetic token with empty tag), so there is no path that produces malformed HTML.

**Lesson**: the previous Bugs 19–30 retrospective focused on `findFencedCodeBlockRanges`; this one was elsewhere entirely. The Bug 31 family was a structural fragility in `filterTokens` (treating `skip === 0` as "no correction needed"), invisible until a handler that actually returns it and a downstream handler that depends on iteration order both showed up — exactly the case for the pair (`includes-detect` → `includes`).

---

### Bug 32: non-ASCII (cyrillic) anchor id makes `extractSection` return the whole file

**Symptom**: A `{% include notitle [x](file.md#anchor) %}` (here inside a term definition) whose `#anchor` contains a cyrillic character inlined the **entire** `popups.md` file instead of the one target section. Surfaced on alice `ru/socket/how-use.md`: the term `[*YNDX-00540-с-Matter]: {% include notitle [...](_includes/popups.md#YNDX-00540-с-Matter) %}` pulled in every popup section (`#socket-model`, `#QR-code`, `#indicator`, `#location-access`, `#frequency-2-4GHz`, …), adding ~70 lines of stray content and a phantom menu entry. The anchor uses a cyrillic `с` in `YNDX-00540-с-Matter`.

**Root cause**: [`merge-includes.ts`](../src/commands/build/features/output-md/plugins/merge-includes.ts) parsed heading anchors with `CUSTOM_ANCHOR_RE = /\{\s*#([\w-]+)\s*\}/`. `\w` in JavaScript is ASCII-only (`[A-Za-z0-9_]`), so `[\w-]+` stopped at the cyrillic `с`, the trailing `\s*\}` then failed, and the whole regex returned `null`. `parseHeading` fell back to `slugify` and produced `yndx-00540-s-matter` (transliterated, lower-cased), which never equals the link hash `YNDX-00540-с-Matter`. With no heading matching, `extractSection` hit its `ctx.start >= 0 ? … : content` guard and returned the **entire file**. `notitle` then stripped only the first heading, leaking the rest.

**Fix**: made the anchor classes Unicode-aware: `CUSTOM_ANCHOR_RE = /\{\s*#([\p{L}\p{N}_-]+)\s*\}/u` and a global twin `CUSTOM_ANCHOR_GLOBAL_RE` for the `slugify` pre-strip in `parseHeading`. This matches how the viewer's `markdown-it-attrs` parses ids (which is why the viewer rendered the section correctly all along).

**Regression coverage**:

- [`merge-includes.spec.ts`](../src/commands/build/features/output-md/plugins/merge-includes.spec.ts) — `extractSection` returns only the cyrillic-anchored section (mid-file and at-EOF cases).
- End-to-end: `ru/socket/how-use.md` md2md output shrank from 264 → 192 lines; the term def now resolves to just `![Matter-розетка](…)` and no popup sections leak.

**Lesson**: any regex that classifies "identifier characters" against user-authored anchors must be Unicode-aware. The md2md text-level parser must mirror the token-level (`markdown-it-attrs`) id rules, or the two paths silently diverge — and the failure mode (return the whole file) is maximally noisy.

---

### Bug 33: `cutHeading` ended a `#hash` section at a shallower heading, dropping `notitle` includes

**Symptom**: A `{% include notitle [x](file.md#section) %}` whose target section contained a **nested** include resolved to nothing in `html-without-merge-includes` (and on the viewer, per the report), while `with-merge-includes` rendered it correctly. Surfaced on alice `uz/smart-home/third-party/troubleshooting/unruly.md`: line 3 includes `_includes/reusables.md#quick-notifications`, whose section is `#### {#quick-notifications}` (h4) followed by a nested `{% include [telegram](…telegram.md#floating-button) %}`. The telegram include expands to `### {#floating-button}` (h3) + a button div.

**Root cause**: [`output-html/plugins/includes.ts:cutHeading`](../src/commands/build/features/output-html/plugins/includes.ts) terminated the section at the next heading of the same **or shallower** level: `level >= Number(token.tag.slice(1))`. The nested telegram include, expanded **before** `cutTokens` ran, introduced an `h3` inside the `h4` section. `4 >= 3` matched, so the section was cut down to just the `h4` heading; `notitle` then stripped that heading, leaving zero tokens. This diverged from both reference implementations, which end a section only at the **same** level:

- viewer: [`@diplodoc/transform` `findBlockTokens`](../../transform/src/transform/utils.ts) — `token.tag === startToken.tag`.
- md2md: [`merge-includes.ts` `processHeadingForSection`](../src/commands/build/features/output-md/plugins/merge-includes.ts) — `heading.level === ctx.level`.

**Fix**: changed the `cutHeading` boundary check from `>=` to `===` (same level only), bringing `output-html` in line with the viewer and merge-includes. A nested include's shallower heading no longer prematurely ends the parent section.

**Regression coverage**:

- [`includes.spec.ts`](../src/commands/build/features/output-html/plugins/includes.spec.ts) — a `notitle` include of an `#### {#section}` whose body is a nested include expanding to `### {#inner}` + content keeps the inner content (asserts `telegram-btn` present, no `< path=` placeholder). The test wires `markdown-it-attrs` and registers plugins in production order (`includes` before `includesDetect`) so `{#id}` becomes a real id and the ruler order is `[includes_detect, includes, curly_attributes]`.
- End-to-end: alice mode-mismatch count dropped 1079 → 1042 after the fix; `unruly.html` now contains the telegram button.

**Lesson**: `#hash` section boundaries must be defined identically across all three paths (viewer token-cut, md2md text-cut, md2html token-cut). The "same level only" rule is the contract; `output-html` was the lone `>=` outlier. Also note section boundaries are computed **after** nested includes expand in the token paths — so an included heading participates in boundary detection, which is exactly why the level rule must match the viewer's.

---

### Bug 34: include file's `vcsPath` frontmatter was non-deterministic under parallel builds (-j2)

**Symptom**: E2E snapshots flaked on the `vcsPath` field of include files written by `output-md`. `tests/e2e/regression.test.ts` (`internal`) and `tests/e2e/includes.test.ts` intermittently showed `vcsPath: includes/fragments.md` (and similar) present in some runs and missing in others. The flake only reproduced under the full `vitest` suite / parallel scheduling, never in single direct builds. My Bug 33 (`cutHeading`) and merge-includes timing changes did not cause it — they shifted task ordering enough to expose a pre-existing latent race.

**Root cause**: `vcsPath` is populated into `run.meta` by the `Contributors` markdown `Dump` hook (`features/contributors`, stage `-1`), which runs **per TOC entry** and calls `run.vcs.metadata(path)`. The `output-md` recursive include dump (`features/output-md/index.ts`, `Build.Md` hook at stage `-Infinity`) writes the include file's YAML frontmatter via `run.meta.dump(graph.path)`. When the same file is both a TOC entry and an include dependency of another entry, the two run concurrently across entries: if the include dump reads `meta` before that file's own entry `Contributors` hook populated `vcsPath`, the frontmatter is written without it. Last-writer-wins on the file, so the result depended on scheduling order (documented latent race; see the comment block above `run.meta.dump` and ADR-002).

**Fix**: in the include-dump branch of `output-md`, when the include file is itself a TOC entry (`run.toc.isEntry(graph.path)`), resolve its VCS metadata explicitly before dumping:

```ts
if (run.toc.isEntry(graph.path)) {
  const vcsMeta = await run.vcs.metadata(graph.path, graph.deps.map(get('path')));
  run.meta.add(graph.path, vcsMeta);
  run.meta.addResources(graph.path, vcsMeta);
}
const includeMeta = await run.meta.dump(graph.path);
```

`vcs.metadata` is idempotent — config-gated, deterministic `realpath`, and `getContributors`/`getMTime` memoized by path — so resolving it here yields the same result regardless of whether the entry hook already ran, making write order irrelevant. The `isEntry` gate is essential: pure includes (e.g. `_includes/*.md` that are never TOC entries) must **not** gain a `vcsPath` frontmatter, otherwise their output diverges from the no-frontmatter contract (caught by `merge-includes.spec.ts` "without flag" and `preprocess.test.ts`).

**Regression coverage**: full `tests/e2e` suite run 3× consecutively with zero flake; `regression` + `includes` run 3× green. Snapshots updated to reflect deterministic `vcsPath` presence on entry-include files (e.g. `toc-include.md`, `includes/fragments.md`).

**Lesson**: when a file participates in two concurrent processing paths (entry vs include dependency) that both feed the same `run.meta`, the consumer that writes output must not depend on the other path having populated metadata first. Make the write path self-sufficient (resolve the deterministic metadata it needs), but gate it on the same condition the producing path uses (`isEntry`) so non-entries keep their original shape.

---

### Stability retrospective (Bugs 19–34)

The fixes accumulated in this ADR for `findFencedCodeBlockRanges` (the
single source of truth for "does an `{% include %}` lie inside a
code block?") have been re-evaluated against the realised regressions:

| Bug | Type                                                       | Asymmetry                               | Safe?                                                  |
| --- | ---------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| 25  | YFM closer ` ```\|` / ` ```\|\|` / ` ```\|#` at line start | YFM-only suffix                         | yes (gated by an active opener and char/length match)  |
| 26  | HTML comment ranges excluded from fence scan               | n/a                                     | yes (the markdown parser also ignores comment content) |
| 28  | YFM closer ` ```\|\|` at end of content line               | YFM-only suffix                         | yes (same gating as Bug 25)                            |
| 29  | List / deflist opener strip (`-`, `*`, `+`, `\d+.`, `:`)   | asymmetric (closer has no marker)       | yes                                                    |
| 29  | Blockquote opener strip (`>`)                              | **symmetric** (closer also carries `>`) | **NO — reverted in Bug 30**                            |

The lesson is the asymmetry test: a container that prefixes only the
opener line (list / deflist) is safe to strip one-sided; a container
that prefixes every line of its body (blockquote) is not. Future
container-prefix additions must pass this test before being shipped.

A separate, structural lesson (recorded for the merge-includes
inlinability rules — see `canInlineInclude` and the surrounding bug
list, especially Bugs 24, 27): when the source ambiguity is between
"inline cleanly" and "anything could happen on the boundary", the
default should be the `{% included %}` fallback. Adding code to detect
new safe-to-inline patterns trades stability for fewer appendix blocks
in the output, which is usually a bad trade — appendices are
viewer-rendered identically to inline content and cost nothing.

---

### Limitation: GFM tables with bold headers inside multiline term bodies (YFM009)

**Context**: A multiline `[*term]:` body that inlines a file whose first rows are a GFM-style table (`**…|…**` then `---|`) used to confuse the term plugin / linter after merge-includes (YFM009).

**Mitigation in CLI**: `canInlineInclude` detects risky patterns when the include sits in the term section (`processTermSectionDeps` calls `canInlineInclude(..., false)`): GFM `**…|…**` tables, `- **…` / `* **…` list openers, or a dependency that is **only** another `{% include %}` while the parent term uses a **multiline** layout (label and include not on the same line — blockquote or paragraph). Single-line `[*key]: {% include %}` stays inlined. Such deps get `{% included %}` fallback blocks.

**Transform**: No plugin change required for these patterns as long as the fallback path is used.

---

## Alternatives Considered

### 1. Processing at markdown-it token level

**Pros**: Already implemented in output-html  
**Cons**: Requires full parsing; hard to preserve original Markdown

### 2. Lazy-loading includes on the client

**Pros**: No md2md changes  
**Cons**: Does not fix many S3 requests

### 3. Bundling includes into a separate JSON

**Pros**: One request for all includes  
**Cons**: Client changes; complexity stays high

## Open Questions (resolution status)

### Q1: Term definition conflict strategy ✅ RESOLVED (updated)

**Context**: Same term defined in multiple files. Extra case:
parent page may use a term without a definition — definition comes from the include chain (reuse across pages).

**Resolution**: Deduplicate by content + source-file suffix on conflicts.

**Algorithm:**

1. Collect all `[*key]: ...` definitions from root and all deps
2. If definitions match → no duplicate
3. If they differ → conflict:
   - First definition (tree traversal order) keeps `[*key]`
   - Later ones renamed to `[*key--normalized-path]`
   - References in that dep’s content updated
4. All definitions moved to end of file

**Suffix format**: `--normalized-path` (readable path to source instead of a hash).
Normalization: strip `_includes/`, replace `/` with `-`, strip `.md`.
Example: `_includes/api/chapter2.md` → `[*api--api-chapter2]`.

**Example — undefined term in root:**

```markdown
<!-- main.md — uses *api but does NOT define -->

Working with [API](*api).
{% include [](terms.md) %}

<!-- terms.md -->

[*api]: Application Programming Interface
```

Result: definition from `terms.md` is available in main.md — correct behavior.

**Example — conflict (different content):**

```markdown
<!-- main.md -->

[*api]: REST API for working with data

<!-- _includes/graphql/intro.md -->

[*api]: GraphQL API for queries
```

After merging:

```markdown
...uses [API](*api)...

...uses [API](*api--graphql-intro)...

[*api]: REST API for working with data
[*api--graphql-intro]: GraphQL API for queries
```

**Example — same content (via shared include):**

```markdown
<!-- chapter1.md includes shared-terms.md -->

{% include [](shared-terms.md) %}
Text with [API](*api).

<!-- chapter2.md also includes shared-terms.md -->

{% include [](shared-terms.md) %}
Other text with [API](*api).

<!-- shared-terms.md -->

[*api]: Application Programming Interface
```

Result: `[*api]` appears once — definitions match, no duplicate.

**Benefits:**

- ✅ No duplication when definition content matches
- ✅ On conflict, suffix shows path — easy to find source
- ✅ Works with “undefined” terms (definition only in include chain)
- ✅ Deterministic outcome (traversal order sets priority)

---

### Q2: Extending term definition syntax ✅ RESOLVED

**Context**: Term definitions used to end at a blank line (unless followed by include).

**Resolution**: Option B — definition continues until the next term or EOF.

**New parsing rule:**

```
Term definition = [*key]: content
                  (any content until next [*other_key]: or EOF)
```

**Example:**

```markdown
[*api]: API (Application Programming Interface) is a set of
definitions and protocols for building and integrating
software.

More about APIs:

- REST API
- GraphQL API
- gRPC

[*sdk]: SDK (Software Development Kit) is a toolkit that lets you
build applications.
```

**Code changes:**

- Update `termDefinitions.ts` for multiline without include-only restriction
- Constraint: all term definitions must be at end of file (after main content)

---

### Q3: Terms in includes — allow or forbid? ✅ RESOLVED

**Context**: Include files may carry their own term definitions.

**Resolution**: Aligns with Q1 — terms in includes are allowed and merged with content deduplication
and source-path suffix on conflicts (see Q1).

**Algorithm:**

1. Collect all term definitions from root and includes
2. On key conflict — dedupe by content + path suffix (see Q1)
3. All terms appended to end of main file
4. Undefined terms in root are valid if definition exists in the include chain

---

### Q4: Indent handling in lists ✅ RESOLVED

**Context**: Include inside a list must preserve indents.

**Resolution**: Option A — automatic indent addition.

**Algorithm:**

1. Measure include directive indent (spaces/tabs at line start)
2. Apply that indent to every line of included content
3. Exceptions: blank lines and code block bodies

**Implementation** (from PR #1305):

````typescript
function addIndent(content: string, indent: string): string {
  const lines = content.split('\n');
  let inCodeBlock = false;

  return lines
    .map((line) => {
      // Track code blocks
      if (line.trimStart().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
      }

      // Leave blank lines and code blocks untouched
      if (line.trim() === '' || inCodeBlock) {
        return line;
      }

      return indent + line;
    })
    .join('\n');
}
````

---

### Q5: Source maps and debugging ✅ RESOLVED

**Context**: After merging, error line numbers no longer match original files.

**Resolution**: Option A — inline debug comments.

**Format:**

```markdown
<!-- source: _includes/chapter1.md:1 -->

## Chapter 1

Chapter body...

<!-- source: _includes/chapter1.md:15 -->

### Subsection
```

**Benefits:**

- Simple implementation
- No extra files
- Easy to read while debugging
- Comments ignored when rendering

---

### Q6: Frontmatter from includes 🔶 PARTIALLY RESOLVED

**Context**: Include files may have frontmatter with CSP, meta, etc.

**Status**: Lightweight case implemented (see Stage 6). For the general case the default is still to strip.

**Resolution (lightweight):** option B applied to a narrow case — when the parent is empty (no own frontmatter, body is a single include), the include's authored frontmatter is propagated into the parent (chain-aware). Non-empty parents still strip include frontmatter.

**Future options (general case):**

- A) **Strip entirely** — as in output-html today (current behavior for non-empty parents)
- B) **Merge into main frontmatter** — combine CSP, meta, etc.
- C) **Selective merge** — only certain fields (CSP, scripts, styles)

---

### Q7: Implementation stage order ✅ RESOLVED

**Context**: Define MVP and follow-on iterations.

**Resolution**: Start with multiline terms, then follow the proposed order.

**Important**: Merge includes runs at the same pipeline stage as merge SVG and autotitle — i.e. **after Liquid resolution**. Liquid variables should not be an issue.

**Final implementation order (progressive inlining — see Q9):**

| Stage | Task                                                        | Priority | Status      | Inline coverage       |
| ----- | ----------------------------------------------------------- | -------- | ----------- | --------------------- |
| 0     | **Terms — multiline support** (transform changes)           | Critical | ✅ Done     | —                     |
| 1a    | **Fix `{% included %}` blocks** — fallback mechanism        | High     | ✅ Done     | 0% (all via fallback) |
| 1b    | **Simple inlining** — indent=0, notitle, no hash/terms      | High     | ✅ Done     | ~80% of includes      |
| 2     | **List indent handling** → wider inlining (v7–v8)           | High     | ✅ Done     | ~90%                  |
| 3     | **`#hash` section extraction** → wider inlining (v7–v8)     | High     | ✅ Done     | ~95%                  |
| 4     | **Full term support** (collection, merge, conflicts) → 100% | High     | ✅ Done     | 100%                  |
| 5     | **Source maps** (inline comments)                           | Medium   | ✅ Done     | —                     |
| 6     | Frontmatter merging (lightweight: empty-parent passthrough) | Low      | 🔶 Partial  | —                     |
| 7     | Duplicate anchor detection                                  | Low      | ⬜ Deferred | —                     |

**Note**: “Inline coverage” is an estimate of includes inlined in place
(the rest use `{% included %}` fallback). Percentages reflect typical usage:
most includes are simple top-level inserts without hash/terms.

---

### Q8: Anchors and ID conflicts ✅ RESOLVED

**Context**: Different include files may share anchors (anchors/IDs):

```markdown
<!-- file1.md -->

## Introduction {#intro}

<!-- file2.md -->

## Introduction {#intro}
```

**Resolution**: Emit warnings when duplicate anchors are detected.

**Rationale**:

- HTML phase currently leaves anchors unchanged — no renaming
- Duplicate anchors in one document are a markup error
- Automatic renaming could break existing links
- Warnings let authors fix the issue

**Algorithm:**

1. When merging includes, collect explicit `{#id}` anchors and automatic (from headings)
2. Track source for each anchor (file:line)
3. On duplicate — warning listing both sources
4. Do not rename anchors automatically

**Sample warning:**

```
WARN: Duplicate anchor '#intro' found:
  - file1.md:5 (## Introduction {#intro})
  - file2.md:3 (## Introduction {#intro})
```

**Implementation**: Add in Stage 5 (Source maps) or as separate Stage 7.

---

### Q9: Stage 1 (`{% included %}` blocks) — fix or not? ✅ RESOLVED

**Context**: Stage 1 (v2) used `{% included %}` blocks but did not fully work (read path — viewer). Later stages (2–5) aim for full inlining, which could make `{% included %}`
unnecessary. Question: fix Stage 1, and how to combine both?

**Comparison:**

|                           | `{% included %}` blocks (Stage 1)                                                | Full inlining (Stages 2–5)                                                  |
| ------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Write (md2md)**         | `{% include %}` directives kept, dep content appended as `{% included %}` blocks | `{% include %}` replaced with content and notitle/hash/indent/term handling |
| **Read (viewer/CLI)**     | Transform pipeline resolves includes (notitle, hash, terms)                      | Content already “flat”; includes not processed                              |
| **Implementation effort** | Low — uses existing transform pipeline                                           | High — notitle/hash/terms/indents reimplemented at text level               |
| **Benefit**               | Removes S3 requests                                                              | Removes S3 requests + less render load                                      |
| **Risk**                  | Minimal — relies on proven code                                                  | High — text-level Markdown parsing is fragile                               |

**Resolution: Progressive inlining with `{% included %}` fallback**

Use BOTH approaches and widen inline support over time:

1. **Fix Stage 1** — `{% included %}` becomes a working fallback
2. **Add simple inlining** — straightforward includes expand in place
3. **Expand gradually** — each stage adds complexity cases for inlining
4. **End goal** — all includes inlined; `{% included %}` blocks not emitted

**Inlining criteria (expand in place only if ALL hold):**

| Condition                           | Check                                  | Shipped in |
| ----------------------------------- | -------------------------------------- | ---------- |
| No indent (not inside list/tab/cut) | `indent === 0` on `{% include %}` line | Stage 1b   |
| `notitle` handled                   | Strip first heading (`# ...` line)     | Stage 1b   |
| No `#hash` section                  | No `#fragment` in file path            | Stage 3    |
| No term definitions in content      | No `[*key]:` pattern in content        | Stage 4    |

If **ANY** condition fails — use `{% included %}` fallback.

**How this looks in output:**

```markdown
# Main content

Content from simple.md (inlined — was a simple include)

{% include [title](complex.md#section) %}

{% included (_includes/complex.md) %}
Content from complex.md (complex include — hash, left as included)
{% endincluded %}
```

**How this reads:**

- Inlined content is plain text — nothing to do
- `{% include %}` + `{% included %}` — handled by transform as usual
- Both formats work together: `preprocessors/included` parses blocks, `plugins/includes`
  resolves directives; inlined content is already part of the document

**Nested includes with mixed approach:**

If parent include A is inlined but child B is not:

1. Content of A is inserted in place (paths rebased via `rebaseRelativePaths`)
2. `{% include %}` for B inside A is now in main content with rebased path
3. B added as `{% included (rebased-B-path) %}` block (NO colon-chain because A is inlined)
4. Transform resolves B using the rebased path

**Example:**

```markdown
<!-- main.md includes outer.md, outer.md includes inner.md#section -->
<!-- outer.md — simple include (indent=0, no hash, no terms) → inlined -->
<!-- inner.md — complex include (has #section) → {% included %} fallback -->

# Heading from main.md

Content from outer.md (inlined)

{% include [inner](_includes/inner.md#section) %}

{% included (_includes/inner.md) %}
Content from inner.md
{% endincluded %}
```

**Benefits:**

- ✅ Working solution immediately (after `{% included %}` fallback fix)
- ✅ ~80% of includes are simple — inlined at Stage 1b
- ✅ Complex cases handled by battle-tested transform pipeline
- ✅ Each stage widens the set of inline-eligible includes
- ✅ Safe rollback: failed inline → `{% included %}` fallback
- ✅ Gradual migration: track “% of inlined includes”

**What broke and was fixed (v3):**

Write (md2md) worked. Read (md2html) broke for three reasons:

1. **ENOENT loading dep files**: `MarkdownService._deps()` recursively calls
   `load()` per dep. When a dep file is missing (embedded in parent), `load()`
   created `Defer` and `reject()`. A timing issue with Defer promises meant
   `_deps()` try/catch did not catch the error. **Fixed**: `load()` on ENOENT with `from`
   resolves Defer with empty content.
2. **Double path rebasing**: `merge-includes.ts` rebased paths in content
   (`rebaseRelativePaths`), but transform resolved again relative to source file
   via colon-chain → doubled path (`includes/includes/sub/user.md`).
   **Fixed**: removed `rebaseRelativePaths` from `collectAllDeps`.
3. **`run.lint()` skipped `{% included %}` blocks**: `lint()` loaded deps
   directly via `this.files()` without `extractIncludedBlocks`.
   **Fixed**: `lint()` uses `extractIncludedBlocks` like `transform()`.

**Tasks (v5 — Stage 1b, simple include inlining, done):**

1. ✅ Implemented `canInlineInclude(dep, parentContent)` — inlining criteria
   (indent=0, no hash in link, no term definitions in content)
2. ✅ Implemented `stripFirstHeading(content)` — strip first heading for `notitle`
3. ✅ Updated `mergeIncludes` — hybrid inline + fallback per dep
4. ✅ Dedupe `{% included %}` blocks via `seen` Set
5. ✅ Nested deps when inlining: `collectFallbackDepsForInlined` with rebased keys
6. ✅ Fixed `rebaseLinksInLine` — added `LINKED_IMAGE_RE` for `[![alt](img)](url)`
7. ✅ `output-md/index.ts` passes `graph.content` as `parentContent` to `mergeIncludes`
8. ✅ Updated all e2e snapshots (preprocess, regression, includes, pdf-page, include-toc)

**Tasks (v6 — link rebasing fixes and viewer integration, done):**

Large-scale testing found `YFM003` (unreachable link) and `YFM016` (self-include) from bad rebasing. All fixed:

1. ✅ **YFM016: self-include from `{% included %}` blocks**: `resolveDependencies` found
   `{% include %}` inside `{% included %}` blocks and treated them as self-include.
   **Fixed**: early `continue` for excluded ranges in `resolve-deps.ts`.

2. ✅ **YFM003: linked images with attributes**: `[![alt](img){height=25px}](url)` not rebased due to attributes between `)` and `]`.
   **Fixed**: via regex iterations (later superseded by simplification).

3. ✅ **YFM003: term refs and template directives**: `rebaseUrl()` tried to rebase
   YFM term links (`*term`) and Liquid (`{%...}`).
   **Fixed**: `url.startsWith('*')` and `url.startsWith('{')` checks in `rebaseUrl`.

4. ✅ **YFM003: code fence detection**: Lines like `` `console.log()` `` wrongly opened a fenced block.
   **Fixed**: CommonMark check — backtick fence does not open if info string contains backticks.

5. ✅ **YFM003: nonstandard fence close**: Closing fence ` ```|| `
   (tables) not matched due to strict `\s*$` in regex.
   **Fixed**: closing regex allows `\s*\|\|` after fence chars.

6. ✅ **YFM003: leading space in link URL**: `[text]( url)` not rebased.
   **Fixed**: `\s*` after opening `(` in regex.

7. ✅ **YFM003: double-bracket autotitle**: `[[!TITLE path]](url)` not rebased.
   **Fixed**: interim nested-parens solution (later simplified).

8. ✅ **ReDoS**: Unclosed parens in code spans hung regex `(?:[^\[\]]*|\[[^\]]*\])*`.
   **Fixed**: backtrack-safe refactor (later simplified).

9. ✅ **YFM003: nested links**: `[outer [inner](inner-url) text](outer-url)` —
   complex regex failed both URLs.
   **Fixed**: single `LINK_URL_RE = /(\]\(\s*)([^)\s]+)/g` matching `](url` at any nesting depth.

**Final rebasing approach:**

Instead of many regexes (`INLINE_LINK_RE`, `LINKED_IMAGE_RE`,
`FULL_LINKED_IMAGE_RE`, `DOUBLE_BRACKET_LINK_RE` + placeholders), use one universal regex:

```typescript
const LINK_URL_RE = /(\]\(\s*)([^)\s]+)/g;
```

This matches `](url` — common to ALL Markdown links (inline, linked images,
nested links, autotitle) regardless of nesting depth and link text complexity.
Link definitions keep separate `LINK_DEF_RE`.

**Outcome**: 127 unit tests, 118 e2e tests, validated on 10+ real doc sets.

10. ✅ **Viewer integration**: Reviewed viewer code
    (`docs-viewer-external/packages/models/src/transformer`). **No changes needed**:
    - `root` is already passed in `transformMarkdown` options (`doc-transform.js:140,148`)
    - `@diplodoc/transform` v4.70.1 includes `preprocessors/included` — parses `{% included %}`
      blocks into `md.included[resolvedPath]`
    - `md.ts:139` passes `md` to `preprocess()` → preprocessor gets markdown-it instance
    - Viewer includes plugin (`plugins/includes/index.js:79-80`) already looks up:
      `md?.included?.[resolve('./', pathname)]`
    - Keys align: preprocessor stores `resolve(fromDir, relativePath)`,
      plugin uses `resolve('./', viewerResolvedPath)` — same absolute path
    - Colon-chain keys handled by preprocessor: `_includes/outer.md:inner.md` →
      `getFullIncludePath('_includes/outer.md', root, path)` → `getFullIncludePath('inner.md', root, outer)`

**Remaining TODO:** None. Stages 1a and 1b complete, including viewer integration.

---

## E2E Test Plan

### Basic scenarios

```
tests/e2e/merge-includes/
├── basic/
│   ├── input/
│   │   ├── main.md
│   │   ├── _includes/
│   │   │   ├── simple.md
│   │   │   └── nested.md
│   │   └── toc.yaml
│   └── expected/
│       └── main.md
├── notitle/
├── hash-section/
├── nested-lists/
├── tabs-and-cuts/
├── terms-basic/
├── terms-multiline/
├── terms-in-includes/
├── terms-conflicts/
├── circular-includes/
├── relative-paths/
└── frontmatter/
```

### Test cases

| ID  | Scenario             | Input                            | Expected outcome              |
| --- | -------------------- | -------------------------------- | ----------------------------- |
| T1  | Simple include       | `{% include [](a.md) %}`         | Content of a.md inserted      |
| T2  | Include with notitle | `{% include notitle [](a.md) %}` | Content without first heading |
| T3  | Include with #hash   | `{% include [](a.md#section) %}` | Only the requested section    |
| T4  | Nested include       | a.md includes b.md               | Both contents inserted        |
| T5  | Include in list      | `- {% include [](a.md) %}`       | Content with correct indents  |
| T6  | Include in tabs      | Inside `{% list tabs %}`         | Tabs structure preserved      |
| T7  | Term definition      | `[*term]: description`           | Term at end of file           |
| T8  | Term multiline       | Term spanning multiple lines     | Full definition preserved     |
| T9  | Term in include      | Include contains terms           | Terms collected at end        |
| T10 | Term conflict        | Same term in two files           | Warning + key suffix          |
| T11 | Circular include     | a→b→a                            | Error with clear message      |
| T12 | Relative paths       | `![](./img.png)` in include      | Path rebased                  |
| T13 | Duplicate anchors    | `{#intro}` in two includes       | Warning listing sources       |

## Related Documents

- [ADR-004: Output Format MD](./ADR-004-output-format-md.md)
- [ADR-005: Linting Includes Line Numbers](./ADR-005-linting-includes-line-numbers.md)
- PR #1305 (GitHub) — earlier implementation attempt
