# Incremental translation manifests

`yfm translate --update-manifest manifest.json --source ru --target en --provider openai ...`
applies source changes to an existing translation. Ordinary translation is unchanged.
The manifest mode requires one target language and cannot be combined with file filters or asset copying.

```json
{
  "schemaVersion": 1,
  "files": [{
    "kind": "update",
    "sourcePath": "ru/page.md",
    "targetPath": "en/page.md",
    "sourceBeforePath": "snapshots/before.md",
    "sourceAfterPath": "snapshots/after.md",
    "targetBeforePath": "snapshots/target.md"
  }]
}
```

Snapshot paths are relative to the manifest directory. Logical paths are relative to the input/output root. Traversal, symlink escapes, duplicate paths, invalid UTF-8 and incompatible languages are rejected before model requests. The caller must ensure the current source still matches source-before or source-after; the tasklet validates this before creating the manifest.

A `create` entry omits both before paths. Existing input/output targets cannot be overwritten by a create entry. Only truly new documents should use this mode.

Updates use exact raw target slices. The initial implementation supports uniquely identifiable headings and prose paragraphs, anchored by explicit IDs or literal inline code. Insertions require uniquely mapped adjacent boundaries. Repeated blocks, uncertain sentence correspondence, structural containers, and ambiguous localized tokens produce conflicts. In particular, unsupported release-note cut insertions are rejected rather than backfilling old releases. This version intentionally prioritizes preserving manual translations over accepting every source edit.

Changed units bypass seeded answer reuse. Unchanged ranges are retained without serialization. A file is atomic: if any planned edit fails, no output for that file is written. Other files continue. Opaque conditional neighbors are excluded from model context. Dry-run validates and plans without requesting translations or writing target files.

Report schema version 2 includes `updates`, with per-source-path `planned`, `applied`, `rejected` counts and diagnostics. Consumers must check these results before using output; a process producing some files can still report conflicts. An incompatible engine must never trigger whole-document fallback.

The feature is not a cross-language semantic merge. It cannot prove that a human paraphrase with identical structure has identical meaning. Ambiguous cases require manual translation.
