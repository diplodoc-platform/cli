# ADR-004: Output Format MD (md2md)

## Status

Accepted

## Context

`@diplodoc/cli` supports two output formats:

1. **md2html** — converts markdown to HTML documentation site
2. **md2md** — transforms markdown, preserving markdown format

The `md2md` format (`--output-format=md`) is used for:

- Pre-processing documentation before final build
- Resolving variables and conditions (liquid syntax)
- Adding metadata to files
- Copying include files as dependencies (includes remain as `{% include %}` directives)
- Preparing content for external systems or subsequent md2html build

## Problem

In `md2md` mode, the same file can be written by multiple code paths:

1. **Entry processing** — file listed in `toc.yaml` is processed as a page
2. **Include processing** — file included via `{% include %}` is copied as dependency

These paths historically had different behaviors:

| Path | YAML Frontmatter | Metadata |
|------|------------------|----------|
| Entry | ✅ Added | ✅ Complete |
| Include | ❌ Not added | ❌ Missing |

When a file is **both** an entry and an include:
- Entry writes file WITH frontmatter
- Include writes file WITHOUT frontmatter
- **Last writer wins** — metadata may be lost

## Decision

### Principle: All Output Files Have Frontmatter

In `md2md` mode, **every** markdown file written to output must have YAML frontmatter with complete metadata.

### Implementation

1. **Entry files** — already have frontmatter (no change needed)
2. **Include files** — must also receive frontmatter before writing

```typescript
// In output-md/index.ts - include file processing
const vars = run.vars.for(graph.path);
run.meta.addSystemVars(graph.path, vars.__system);
run.meta.addMetadata(graph.path, vars.__metadata);

const meta = await run.meta.dump(graph.path);
const contentWithMeta = addMetaFrontmatter(content, meta);

await run.write(outputPath, contentWithMeta);
```

### Helper Function

```typescript
// output-md/utils.ts
export function addMetaFrontmatter(
  content: string,
  meta: Hash,
  lineWidth?: number,
): string {
  const dumped = yamlDump(meta, { lineWidth }).trim();
  if (dumped === '{}') {
    return content;
  }
  return `---\n${dumped}\n---\n${content}`;
}
```

## Consequences

### Positive

✅ **Deterministic output** — write order doesn't affect result  
✅ **Complete metadata** — all files have `__system`, `vcsPath`, etc.  
✅ **Safe parallelism** — multiple threads can write same file safely  

### Negative

❌ **Larger output** — include files now have frontmatter overhead  
❌ **Changed behavior** — consumers expecting raw includes need adjustment  

### Neutral

- Include files are still valid markdown with frontmatter
- In md2html, include content is inserted into parent document (frontmatter handling depends on include resolver)

## File Write Scenarios

### Scenario 1: File is Entry Only

```
toc.yaml: page.md
No includes of page.md

Result: page.md written once by entry processing ✅
```

### Scenario 2: File is Include Only

```
Not in toc.yaml
other.md: {% include [](page.md) %}

Result: page.md written once by include processing ✅
```

### Scenario 3: File is Both Entry and Include

```
toc.yaml: page.md
other.md: {% include [](page.md) %}

Result: page.md written twice, both with same content ✅
(write order irrelevant)
```

## Testing

Regression test covers scenario 3:

```
tests/mocks/regression/input/
├── entry-as-include.md      # Listed in toc AND included
├── includer-of-entry.md     # Includes entry-as-include.md
└── toc.yaml                 # Lists both files
```

## Related Documents

- [Architecture Quality Principles](./arch-quality.md) — Core architectural principles
- [ADR-002: Multithreading Build](./ADR-002-multithreading-build.md) — Parallel processing considerations
- [ADR-003: Metainfo Extracting](./ADR-003-metainfo-extracting.md) — How metadata is collected
