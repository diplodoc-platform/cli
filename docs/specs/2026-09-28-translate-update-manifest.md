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

Updates use exact raw target slices. Matching uses explicit section IDs, stable code, link and include anchors, container paths, and equal-shaped block gaps between mapped boundaries. A unique document title anchors its preamble. Supported units include headings, paragraphs, list items and table rows. Balanced, complete section insertions add only the new source delta, including new release cuts when older releases are missing from the target. Literal metadata, include and link changes preserve localized values and prose; already applied link changes are no-ops. A conditional containing only a placeholder link may be inserted literally at a mapped boundary. A unique conditional with the same directives and link destination already present in the target is treated as applied.

Repeated blocks, conflicting IDs, uncertain sentence correspondence, conditional prose insertions without a matching target block and multi-block repartitioning produce explicit conflicts. Container delimiters cannot be changed independently. This is a structural correspondence heuristic, not proof of semantic equivalence: a human rewrite with the same structure can still require review.

Changed units bypass seeded answer reuse. Unchanged ranges are retained without serialization. Independent edits can succeed even if other fragments conflict. The file is written with only accepted edits, while rejected ranges remain unchanged and diagnostics identify failures. A file with no accepted edits and any rejection has no output. Opaque conditional neighbors are excluded from model context. Dry-run validates and plans without requesting translations or writing target files.

Report schema version 2 includes `updates`, with per-source-path `planned`, `applied`, `rejected` counts and diagnostics. Applied and rejected counts sum to planned edits; a pre-planning failure can report planned=0, applied=0, rejected=1. Consumers must retain diagnostics and mark output with rejected edits as partial. Any rejected edit causes a nonzero process exit, including when other edits succeeded. An incompatible engine must never trigger whole-document fallback.

The feature is not a cross-language semantic merge. It cannot prove that a human paraphrase with identical structure has identical meaning. Ambiguous cases require manual translation.
