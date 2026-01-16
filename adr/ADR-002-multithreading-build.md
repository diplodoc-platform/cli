# ADR-002: Multithreading Build

## Status

Accepted

## Context

`@diplodoc/cli` supports parallel processing of documentation files using worker threads (`-j N` flag). This significantly speeds up builds for large documentation projects by distributing file processing across multiple CPU cores.

The build process uses:

- **Main thread** — orchestrates the build, distributes work, aggregates results
- **Worker threads** — process individual files (markdown parsing, transformation, writing); each thread has its own service instances

## Problem

The same file can be processed by **multiple code paths** during a single build:

1. **As an entry** — file listed in `toc.yaml` is processed as a page
2. **As an include** — file referenced via `{% include %}` is copied as a dependency

If these paths produce **different output** (e.g., one adds frontmatter, other doesn't), the result depends on which path writes last.

**In single-threaded mode**: order is deterministic, but result may still be wrong for some files.

**In multi-threaded mode**: order is non-deterministic, making bugs intermittent and hard to reproduce.

Example scenario:
```
Code path 1 (Entry):                 Code path 2 (Include):
────────────────────                 ─────────────────────
1. Load file A
2. Add metadata to A
3. Write A WITH frontmatter          1. Process include of A
                                     2. Write A WITHOUT frontmatter
                                        (overwrites path 1's output!)
```

The issue is not about concurrent access to shared state, but about **different code paths producing different output for the same file**.

## Decision

### Principle: Idempotent File Writes

When multiple code paths can write the same file, ensure all writers produce **identical output**. This makes the write order irrelevant.

### Implementation Guidelines

1. **Consistent output format** — All code paths that write a file must produce the same content structure
2. **Complete metadata** — Every write must include full metadata, not partial updates
3. **Verify all write paths** — When adding new file output, check if other paths also write the same file

### Pattern: Complete Writes Over Partial Updates

```typescript
// ❌ Bad: Partial write (entry has metadata, include doesn't)
// Entry processing
await run.write(path, contentWithFrontmatter);

// Include processing
await run.write(path, contentWithoutFrontmatter); // Overwrites!

// ✅ Good: Both paths produce complete output
// Entry processing
const meta = await run.meta.dump(path);
await run.write(path, addFrontmatter(content, meta));

// Include processing  
const meta = await run.meta.dump(path);
await run.write(path, addFrontmatter(content, meta)); // Same result!
```

## Consequences

### Positive

✅ **Deterministic builds** — Output is the same regardless of thread scheduling  
✅ **Easier debugging** — No intermittent failures based on timing  
✅ **Safe parallelism** — Can increase thread count without introducing bugs  

### Negative

❌ **Redundant work** — Same file may be written multiple times by different paths  
❌ **Complexity** — Must ensure all write paths are consistent  
❌ **Easy to miss** — New code paths may not follow the pattern  

### Neutral

- Performance gains from parallelism outweigh overhead of redundant writes
- Debugging requires understanding of concurrent execution

## Related Documents

- [Architecture Quality Principles](./arch-quality.md) — Core architectural principles
- [ADR-003: Metainfo Extracting](./ADR-003-metainfo-extracting.md) — How metadata is collected and stored
- [ADR-004: Output Format MD](./ADR-004-output-format-md.md) — md2md build specifics
