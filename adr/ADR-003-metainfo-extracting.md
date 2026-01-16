# ADR-003: Metainfo Extracting

## Status

Accepted

## Context

Documentation files can contain metadata from multiple sources:

1. **YAML frontmatter** — metadata defined directly in the file
2. **Presets** — variables from `presets.yaml` files (`__system`, `__metadata`)
3. **VCS data** — version control information (`vcsPath`, `sourcePath`)
4. **Generated metadata** — computed during build (e.g., `generator` info)

This metadata needs to be:
- Collected from various sources
- Merged without conflicts
- Written to output files as YAML frontmatter

## Problem

Metadata collection happens at different stages of file processing:

1. **VarsService** loads presets and provides `__system`, `__metadata` variables
2. **MetaService** accumulates metadata for each file
3. **MarkdownService** / **LeadingService** process files and add their metadata
4. **Output writers** need access to complete metadata

Key challenges:

- **Timing** — metadata must be available when file is written
- **Completeness** — all sources must contribute before output
- **Consistency** — same file processed multiple times must get same metadata

## Decision

### MetaService API

`MetaService` provides methods with different semantics:

```typescript
interface MetaService {
  // OVERWRITES all metadata for a file (use with caution)
  set(path: NormalizedPath, meta: Meta): void;
  
  // MERGES new metadata with existing (preferred)
  add(path: NormalizedPath, meta: Meta): void;
  
  // Adds system variables (__system) - merges
  addSystemVars(path: NormalizedPath, vars: SystemVars): void;
  
  // Adds metadata variables (__metadata) - merges  
  addMetadata(path: NormalizedPath, metadata: Metadata): void;
  
  // Returns accumulated metadata for output
  dump(path: NormalizedPath): Promise<Meta>;
}
```

### Usage Guidelines

1. **Prefer `add*` methods over `set`** — merging preserves data from other sources
2. **Call `addSystemVars` and `addMetadata` before `dump`** — ensures presets are included
3. **Always use `dump` for output** — returns complete, normalized metadata

### Pattern: Ensure Metadata Before Write

```typescript
// Before writing any file, ensure all metadata sources are included
const vars = run.vars.for(path);
run.meta.addSystemVars(path, vars.__system);
run.meta.addMetadata(path, vars.__metadata);

const meta = await run.meta.dump(path);
const content = addFrontmatter(rawContent, meta);

await run.write(outputPath, content);
```

## Consequences

### Positive

✅ **Single source of truth** — MetaService accumulates all metadata  
✅ **Flexible merging** — Different sources contribute without conflicts  
✅ **Clear API** — `set` vs `add` makes intent explicit  

### Negative

❌ **Order dependency** — `addSystemVars`/`addMetadata` must be called before `dump`  
❌ **Easy to forget** — Writers must remember to add all metadata sources  
❌ **Potential overwrites** — `set` can accidentally erase accumulated data  

### Neutral

- Metadata keys from later calls override earlier ones (for same key)
- Each worker thread has its own MetaService instance

## Examples

### Correct Usage

```typescript
// In MarkdownService.load()
run.meta.add(path, extractedMeta);

// In output writer
const vars = run.vars.for(path);
run.meta.addSystemVars(path, vars.__system);
run.meta.addMetadata(path, vars.__metadata);
const meta = await run.meta.dump(path);
```

### Incorrect Usage

```typescript
// ❌ Using set() loses previously accumulated metadata
run.meta.set(path, newMeta); // Overwrites everything!

// ❌ Forgetting to add system vars
const meta = await run.meta.dump(path); // Missing __system!
```

## Related Documents

- [Architecture Quality Principles](./arch-quality.md) — Core architectural principles
- [ADR-002: Multithreading Build](./ADR-002-multithreading-build.md) — Parallel processing considerations
- [ADR-004: Output Format MD](./ADR-004-output-format-md.md) — md2md build specifics
