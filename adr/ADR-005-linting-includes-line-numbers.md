# ADR-005: Fixing Line Number Validation in Linting with Include Files

## Status

Implemented (v2 — token-level source tracking)

## Context

When using `{% include %}` directives in YFM markdown files, the linter (yfmlint) throws exceptions with the message "Value of 'lineNumber' passed to onError by 'YFM003' is incorrect". This happens because:

1. The linter receives the original markdown content with `{% include %}` directives (e.g., 51 lines)
2. During parsing, the includes plugin expands these directives, inserting content from other files
3. Tokens from included files have `lineNumber` values relative to their source files (e.g., line 60)
4. The linter validates that `lineNumber` must be within the original file's line count (60 > 51 → error)

This issue affects all rules that validate links and images (YFM002, YFM003, YFM010, YFM011).

## Problem

The original architecture creates a mismatch between:

- The content that `markdownlint` sees (original file with include directives)
- The line numbers in tokens (relative to expanded content with includes)

This results in:

- Linter exceptions that stop the build process
- Inability to identify the actual location of errors in include files
- Poor developer experience when debugging documentation with complex include structures

## Decision (v1 — deprecated)

The first approach attempted to resolve includes at the text level before linting, building a source map, and then remapping error line numbers. This approach was abandoned because:

- The `links` plugin in `@diplodoc/transform` resolves relative paths using `state.env.path`. When all includes are pre-expanded into the main file's text, the links plugin resolves paths relative to the main file — producing false positives for links in included files that use relative paths.
- Filtering out errors from included content was unreliable because `markdown-it` sometimes assigns `lineNumber` from a parent block's start line, making it hard to distinguish main-file vs. included-content errors.
- Additional include resolution logic duplicated what the includes plugin already does during parsing.

## Decision (v2 — current)

Use **token-level source tracking** within the existing `markdown-it` includes plugin. Instead of pre-expanding includes at the text level, we let the includes plugin expand them during parsing (as it always has) and tag the resulting tokens with metadata about their origin.

### 1. Token Source Tagging (includes plugin)

After the includes plugin splices included tokens into the main token stream, each token (and its children) is tagged with:

```typescript
token.meta.sourceFile = 'path/to/included/file.md';
token.meta.includeChain = [
  {file: 'main.md', line: 3}, // where the top-level include is
  {file: 'chapter.md', line: 5}, // where the nested include is
];
```

Tokens already tagged by a deeper nested include are not overwritten (innermost source wins).

### 2. Yfmlint Rule Updates

Helper functions in `@diplodoc/yfmlint` check `token.meta` for source metadata:

- `resolveIncludeSource()` — extracts `sourceFile` and `includeChain` from tokens
- `formatIncludeChain()` — formats the chain as `main.md:3 → chapter.md:5 → details.md:10 ↛ broken.html`

When include source metadata is present, the `lineNumber` reported to `markdownlint` is the line of the top-level include in the main file (clamped to valid range), and the context shows the full chain.

### 3. Simplified Linter Integration

The CLI linter no longer pre-expands includes. It passes the original file content (`vfile.data`) directly to `run.lint()`. The includes plugin handles expansion during `markdown-it` parsing, and yfmlint rules consume the token metadata.

### Output Format

For errors in included content:

```
ERR main.md: 3: YFM003 / unreachable-link Link is unreachable
  [Context: "main.md:3 → _includes/chapter.md:5 → _includes/details.md:10 ↛ broken-page.html; Reason: File is not declared in toc"]
```

For errors in the main file (no includes):

```
ERR main.md: 5: YFM003 / unreachable-link Link is unreachable
  [Context: "Unreachable link: "broken.html"; Reason: File is not declared in toc"]
```

## Consequences

### Positive

✅ **Eliminates lineNumber exceptions** — line numbers are clamped to valid range
✅ **No false positives** — the links plugin resolves paths relative to the correct file during sub-parses
✅ **Precise error location** — full include chain shows exactly where the broken link is
✅ **Simpler implementation** — no text-level include expansion, no source maps, no error filtering
✅ **Backward compatible** — zero new errors on existing 7000+ document builds

### Negative

❌ **Requires yfmlint changes** — rules must know about `token.meta` structure

### Neutral

- The include chain format (`a:1 → b:2 ↛ broken.html`) is compact and readable
- Tokens from cached includes get metadata via `copyToken` + `tagTokensWithSource`

## Implementation Details

### Token Tagging (CLI includes plugin)

```typescript
// packages/cli/src/commands/build/features/output-html/plugins/includes.ts
function tagTokensWithSource(tokens, sourceFile, includeChain) {
  for (const token of tokens) {
    if (!token.meta?.sourceFile) {
      token.meta = token.meta || {};
      token.meta.sourceFile = sourceFile;
      token.meta.includeChain = includeChain;
    }
    // Tag children similarly
  }
}
```

### Include Chain Construction

```typescript
const parentChain = env.includeChain || [];
const currentChain = includeLine
  ? [...parentChain, {file: path, line: includeLine}]
  : [...parentChain];

md.parse(bodyContent, {...env, path: includeFullPath, includeChain: currentChain});

tagTokensWithSource(includedTokens, includeFullPath, currentChain);
```

### Linter Integration (simplified)

```typescript
// packages/cli/src/commands/build/features/linter/index.ts
const errors = await run.lint(vfile.path, vfile.data, {deps, assets});
if (errors) {
  for (const error of errors) {
    error.lineNumber = run.markdown.remap(vfile.path, error.lineNumber);
  }
  log(errors, run.logger);
}
```

## Files Changed

- `packages/cli/src/commands/build/features/output-html/plugins/includes.ts` — added `tagTokensWithSource`, `includeChain` propagation
- `packages/yfmlint/src/rules/helpers.ts` — added `resolveIncludeSource`, `formatIncludeChain`
- `packages/yfmlint/src/rules/yfm003.ts` — uses include chain in error context
- `packages/yfmlint/src/rules/yfm010.ts` — uses include chain in error context
- `packages/cli/src/commands/build/features/linter/index.ts` — simplified (removed pre-expansion)
- Deleted: `includes-resolver.ts`, `includes-resolver.spec.ts`

## Alternatives Considered

1. **Pre-expansion with source map (v1)** — resolve includes at text level before linting
   - Abandoned: produces false positive YFM003 errors because link resolution context is lost

2. **Line number clamping only** — simply limit lineNumber to file length
   - Pros: Simple to implement
   - Cons: Doesn't show actual error location, provides incorrect line numbers

3. **Link path transformation** — rewrite relative links in pre-expanded content
   - Pros: Would allow link validation in included content
   - Cons: Complex, fragile, doesn't handle all edge cases

## Related Documents

- [ADR-006: Merge Includes in md2md](./ADR-006-merge-includes-md2md.md) — Related future work for include merging
- [Command Structure](./../AGENTS.md#command-structure) — Architecture of CLI commands
