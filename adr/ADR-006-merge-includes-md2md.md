# ADR-006: Merge Includes in md2md Mode

## Status

**Implemented (v10). Stages 0–5 are complete: multiline terms (transform), write/read (md2md→md2html), full inlining of all include kinds (indent, hash, terms), link rebasing, source maps. Stage 4 (terms) is implemented: collection, deduplication, conflict resolution, nested includes inside terms. 100% inline coverage. The `{% included %}` fallback is kept as a safety net. Viewer integration requires no changes. Eighteen bugs were found in real documentation sets and fixed. The only deferred item is Stage 6 (frontmatter merging).**

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

### Stage 6: Frontmatter merging (DEFERRED)

**Status**: Needs further analysis.

**Tasks (future work):**

1. Decide which frontmatter fields to merge
2. Implement merge strategy for CSP, scripts, styles
3. Add tests

**Outcome**: Metadata from includes merged into the main file.

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

- Stage 6 — frontmatter merging (needs further analysis)
- Stage 7 — duplicate anchor detection (low priority)

**Testing:**

- Unit tests: `merge-includes.spec.ts` (inlining, terms, rebasing, source maps, hash extraction)
- E2E tests: `tests/e2e/merge-includes.spec.ts` (full md2md → md2html cycle)
- Regression tests: `tests/mocks/regression/` (input/output snapshots)
- Large-scale runs on real docs: alice, ydb, yt, wiki, travel, etc.
- 18 bugs found and fixed (see Known Bugs)

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
eight more. All fixed (Bugs 1–18 below).

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

### Q6: Frontmatter from includes ⏸️ DEFERRED

**Context**: Include files may have frontmatter with CSP, meta, etc.

**Status**: Needs further analysis. Current behavior: strip frontmatter.

**Future options:**

- A) **Strip entirely** — as in output-html today
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
| 6     | Frontmatter merging                                         | Low      | ⬜ Deferred | —                     |
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
