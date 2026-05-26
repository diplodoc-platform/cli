# Build Content Map — design

**Date:** 2026-05-26
**Status:** approved for implementation
**Package:** `@diplodoc/cli`

## Goal

Emit a build artifact containing a content fingerprint for every output page and asset, so an offline tool can compute the exact set of pages that changed between any two build revisions.

Primary consumers:

- search reindexing — reindex only changed pages;
- change notifications — fan out alerts to authors/subscribers when a page changes.

Diff between revisions is computed as a **post-process** over two manifest files. The build itself does not know about other revisions and does not perform incremental builds.

## Non-goals

- Incremental build / reuse cache.
- Root cause analysis ("why did this page change?"). Possible extension in schema v2.
- HTML-level content comparison. Possible extension in schema v2.
- Source-content hashes. Possible extension in schema v2.
- The diff tool itself. It lives at the consumer side.

## Context

The CLI builds documentation in several formats. The `md2md` pass uploads its output to S3, and consumers (search, notifier) read from there. Build properties relevant to this design:

- `mergeIncludes` in `md2md` is **off** by default, and will stay off for about a month before being switched on.
- `hashIncludes` in `md2md` is **on** by default. Include files in the output get a content-derived signature in their filename: `inc.md → inc-{12hex}.md` (see `signlink` in `packages/cli/src/commands/build/features/output-md/utils.ts`), and references in parent pages are rewritten to that signed name.
- Image/video/SVG assets get no fingerprint transformation: `![](pic.png)` stays as-is.
- The project already exposes a dependency graph at `run.entry.relations`: for each entry it holds direct dependencies typed `entry | source | resource | missed`.
- The existing `yfm-build-manifest.json` describes structure (toc-mapping, file-trie, redirects, yfm-config) and is consumed by docs-viewer for navigation. We do not mix content fingerprints into it.

### How changes propagate through the graph

| Scenario                                     | What lands in the entry's final `.md`                 | How an include change shows up in the diff                                    |
| -------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| `mergeIncludes: true`                        | Include content embedded inline                       | Through the entry's content → entry hash changes                              |
| `mergeIncludes: false`, `hashIncludes: true` | Reference `[](inc-{12hex}.md)` with include signature | Through the filename → reference in entry updates → entry hash changes        |
| Image asset                                  | `![](pic.png)` — does not change when the png changes | **Not visible** through the entry hash. Needs an explicit `page → asset` map. |

This table drives the central architectural decision: to cover every live scenario it is enough to (a) hash every file from `run.output`, keyed by source-path, and (b) record direct asset dependencies for each entry. An include graph is redundant in both scenarios that matter for this project.

## Artifact

A new file alongside the existing `yfm-*` artifacts:

**`yfm-build-content.json`**

```json
{
  "schemaVersion": 1,
  "contentHashes": {
    "ru/foo.md": {"hash": "sha256-...", "size": 1234},
    "ru/foo/inc.md": {"hash": "sha256-...", "size": 567},
    "ru/img/pic.png": {"hash": "sha256-...", "size": 8901}
  },
  "pageAssets": {
    "ru/foo.md": ["ru/img/pic.png"]
  }
}
```

Rules:

- **Keys in every section are source-paths** (stable across builds; output-paths are unstable due to signlink).
- **`contentHashes[source]`** — `sha256` of the final file in `run.output`, located via the source → output mapping:
  - entry/leading: identity (`foo.md → foo.md`);
  - include when `hashIncludes: true`, `mergeIncludes: false`: via `signlink`;
  - include when `mergeIncludes: true`: key is absent — the include file is not written to output, its content is already in the entry;
  - asset: identity (`pic.png → pic.png`).
- **`size`** — byte size of the file in output. A cheap heuristic signal for the consumer; not involved in diffing.
- **`hash`** carries a `sha256-` prefix so the algorithm can evolve without breaking consumers.
- **`pageAssets[source]`** — direct `resource`-type dependencies of the entry, normalized to source-paths. Includes are not written here.
- **`schemaVersion: 1`** — for future compatibility.

## Diff algorithm (consumer side)

```
changed_pages = {
  p ∈ entries(curr) |
       prev.contentHashes[p]?.hash ≠ curr.contentHashes[p]?.hash
    OR ∃ a ∈ curr.pageAssets[p]:
         prev.contentHashes[a]?.hash ≠ curr.contentHashes[a]?.hash
}
```

Plus added/removed pages, computed separately:

```
added_pages   = keys(curr.contentHashes) \ keys(prev.contentHashes)
removed_pages = keys(prev.contentHashes) \ keys(curr.contentHashes)
```

The diff tool decides what extension filter to apply: for search indexing — `.md` and `.yaml`; for CDN invalidation — everything.

## Implementation

### Where the code lives

A new feature `build-content-map`, modeled on `build-stats`:

```
packages/cli/src/commands/build/features/build-content-map/
  ├── index.ts
  ├── index.spec.ts
  └── config.ts
```

Registered alongside `BuildStats` and `BuildManifest` in the common build pipeline.

### Flag

`--build-content` (behaves exactly like `--build-stats` and `--build-manifest`):

- option declared in `config.ts` via `~/core/config`;
- `Command` hook adds the option;
- `Config` hook normalizes via the `valuable(...)` check across CLI argument and yfm-config.

### Hook and pipeline

We use `AfterAnyRun` (like `BuildStats`), not `AfterRun.for('md')` — the artifact must be produced for any outputFormat, not just `md`.

Sequence inside `AfterAnyRun`:

1. If `run.config.buildContent !== true` — return.
2. Build `pageAssets`: walk `run.entry.relations`, and for each `entry`-type node collect direct dependencies with `type === 'resource'`. Keys normalized to source-paths.
3. Glob `run.output`: `run.glob('**/*', { cwd: run.output })`. Strip service files via the filter (see "Exclusions" below).
4. For each output file, resolve its source-path using the rules in "Source → output mapping".
5. In parallel (`pmap`, concurrency 30 — same as `STAT_CONCURRENCY` in `build-stats`), for each output file:
   - read content via `run.fs.readFile`;
   - compute `sha256(content)`, format as `sha256-{hex}`;
   - read `size` via `run.fs.stat`;
   - write into `contentHashes[source]`.
6. Serialize the result and write `yfm-build-content.json` via `run.write` with overwrite.

### Exclusions from traversal

Our own build sidecar files must not enter `contentHashes`: they add diff noise and can contain hashes of other files, producing recursive noise.

The filter matches against the path's basename at the top level. The exact set is verified empirically (see "Open questions"); the starting list:

- `yfm-build-manifest.json`
- `yfm-build-stats.json`
- `yfm-build-content.json`
- `yfm-redirects-meta-file.json`
- any `yfm-*-meta.json`

### Source → output mapping (detailed algorithm)

This is the subtle part. The plan:

1. From `run.entry.relations`, collect three sets of source-paths:
   - `entries`: nodes of type `entry`;
   - `sources`: nodes of type `source` (include files);
   - `resources`: nodes of type `resource`.
2. For each output file, resolve its source:
   - if the output-path matches one of the nodes (`entries ∪ sources ∪ resources`) — identity mapping (source = output);
   - otherwise try to parse `name-{12hex}.{ext}` and check whether `name.{ext}` exists in `sources`. If yes — this is a signlink-ed include; map to source.
   - otherwise — the file is not in the graph: identity mapping plus a `debug` log entry (this is expected for prefix-copied assets such as theme assets). Files are only dropped if they hit the exclusions filter from the previous section.
3. For an include built with `mergeIncludes: true` no corresponding output file exists — it is absent from `contentHashes`. That is the correct behavior: its content is already embedded in the entry.

### What gets hashed

We use the **raw file bytes in output** (`run.fs.readFile`, no normalization). This is what actually lands in S3 and what consumers read. Normalizing line endings or whitespace would be wrong — any normalization would mask "the file changed".

### Concurrency and limits

- `pmap` concurrency 30 (same as `STAT_CONCURRENCY` in build-stats) — guards against EMFILE on large projects.
- On very large outputs (tens of thousands of files) the feature adds seconds to the build because of the extra reads. Acceptable for CI; local dev should not turn `--build-content` on by default.

### Graceful degradation

- If `run.entry.relations` is empty or has no entry nodes — `pageAssets` is empty, `contentHashes` is built from the output glob alone. The artifact is still valid.
- If a globbed file fails to read or stat — log a warning and skip (same pattern as `readOutputSize` in `build-stats`).
- `yfm-build-content.json` itself does not exist at glob time, so it never enters the list. Other `yfm-*.json` files are removed by the exclusions filter.

## Testing

Unit-spec `index.spec.ts`:

1. Two full builds from the same source → identical `contentHashes` (determinism).
2. Mutate an entry's content → only its own hash in `contentHashes` changes.
3. Mutate an include's content → include hash changes AND entry hash changes (through signlink); `pageAssets` is unchanged.
4. Mutate an image's content → image hash changes; the entry hash does **not** change (expected), but `pageAssets[entry]` still lists the asset, so the consumer can still mark the entry as changed.
5. Add an image to an entry → `pageAssets[entry]` grows.
6. With `mergeIncludes: true`, the include file's hash is absent from `contentHashes`, but the entry hash changes.
7. Service files (`yfm-*.json`) never appear in `contentHashes`.

E2E against a real mini-documentation tree under `tests/e2e/`:

- build a dataset with one entry, one include, one image;
- assert the structure of `yfm-build-content.json`;
- mutate the image, rebuild, assert that the image's hash changed and `pageAssets` is stable.

### Determinism — task 0

Before any implementation work, verify experimentally that two full builds of the same source produce identical hashes for the final output files. Likely sources of non-determinism:

- `addMetaFrontmatter` — YAML frontmatter key order ([packages/cli/src/commands/build/features/output-md/index.ts:233](packages/cli/src/commands/build/features/output-md/index.ts#L233));
- timestamps in meta (if any);
- unsorted `Map`/`Set` traversals in plugins.

If we find a source of non-determinism — fix it (this is a reproducibility bug regardless). Only after that do we start implementing hashing.

## Evolution

Schema v2 (not now, not part of this spec, but the design preserves compatibility):

- `sourceHashes: { [src]: { hash, size } }` — source-content hash next to the final-content hash;
- `pageIncludes: { [page]: string[] }` — direct includes per page, for root-cause analysis;
- `htmlHash: { [page]: string }` — a separate hash derived from md2html for search indexing without the include wrappers;
- composite per-page hash — not needed on the build side; the diff tool can compute it.

All future fields are added as new keys to the existing JSON. Old consumers ignore unknown fields. `schemaVersion: 2` signals new fields are present; v1-only consumers keep working.

## Open questions (not blockers)

1. Which exact set of `yfm-*.json` files do we exclude from traversal? To be tightened once we see the actual artifact names in `run.output`.
2. Do we need an explicit `type: page | include | asset` enum next to each hash? Currently the consumer infers type from extension and from presence in `pageAssets` values. If that turns out to be insufficient, add the enum in v2.
