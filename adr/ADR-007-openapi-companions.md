# ADR-007: OpenAPI companions (`*.openapi.json`)

Status: accepted.

This document captures the end-to-end contract of the **OpenAPI companion** feature — building
and serving a "cleaned" OpenAPI JSON specification next to the leading page of a section generated
by the `openapi` includer. This is the canonical ADR; the other repositories carry wrapper ADRs
that link back here:

- OpenAPI extension: `extensions/openapi/adr/ADR-003-openapi-companions.md`;
- Viewer (`docs-viewer-external`): `docs/ADR-006-openapi-companions.md`.

The feature mirrors the viewer's source-companions ADR (ADR-005), but for OpenAPI: instead of
serving the raw `.md`/`.yaml`, it serves a file **generated at build time**, named after the
source spec (`petstore.yaml` -> `petstore.openapi.json`).

Example: the leading page `https://host/proj/api/` is accompanied by
`https://host/proj/api/petstore.openapi.json` (the exact name comes from the build manifest).

## Motivation

- Machine-readable access to the spec (LLM/codegen/diffs) without parsing HTML or the JSON embedded
  into the page.
- The spec must be **cleaned exactly like the section**: endpoints removed by the `filter`
  parameter and everything marked `x-hidden` must be gone.
- Huge specs (tens of MB) cannot be inlined into the page — a link mode is required.

## The three parts of the task

### 1. `renderMode` and `maxOpenapiIncludeInlineSize` (openapi extension)

`leadingPage.spec.renderMode` gains a third value — `link`:

| renderMode | Leading page behavior                                                  |
| ---------- | ---------------------------------------------------------------------- |
| `inline`   | (default) the spec is embedded into the page via `{% cut %}`           |
| `hidden`   | the spec is not shown and no companion file is created                 |
| `link`     | instead of inlining, a link to the `*.openapi.json` companion is added |

The build parameter `maxOpenapiIncludeInlineSize` (default `100K`, hard cap `1M`, `0` = always
link): if the serialized spec is larger than the limit and `renderMode: inline`, the mode is
**automatically** switched to `link` with an INFO-level log. `hidden` is never changed. If the
companion file ends up not being created (see parts 2/3), `link` degrades back to `inline` to avoid
a dead link.

The decision and serialization live in `extensions/openapi/src/includer`: `companion.ts`
(`buildCompanionDocument` / `serializeCompanionDocument`) and `resolveCompanion()` in `index.ts`.
The companion is built from the partially dereferenced document (schemas stay as `$ref`, so
recursive schemas remain acyclic and serializable), filtered down to the operations actually
rendered, cleaned of `x-hidden`, and unreachable `components.schemas` are pruned. Serialization is
minified (`JSON.stringify` without indentation). The file name is derived from the includer input
(`companionFilename` in `includer/utils.ts`).

### 2. `ai.openapiCompanions` (yfm-config / CLI flag)

The new `ai` config section controls **whether** the companion file is created and for which build
formats:

| Value   | md2md | md2html | Note             |
| ------- | ----- | ------- | ---------------- |
| `true`  | yes   | yes     |                  |
| `'md'`  | yes   | no      | **default**      |
| `false` | no    | no      | feature disabled |

The CLI flag `--ai-openapi-companions` is a **boolean** override (`true` / `--no-...` = `false`).
It wins only when explicitly passed; otherwise the `.yfm` value is preserved as-is so it stays
overridable from config (same approach as `multilineTermDefinitions`). The default (`'md'`) is
**not** applied in the CLI: it is owned by the openapi extension
(`DEFAULT_OPENAPI_COMPANIONS_MODE`), the single consumer of this value — keeping the default in one
place. Implementation: `ai.openapiCompanions` in `yfm-schema.yaml`, options in
`commands/build/config.ts` (`resolveAiConfig`), the `AiConfig` type in `commands/build/types.ts`.

### 3. Writing the file and the build manifest

- Emission gating (ai + outputFormat + `maxOpenapiIncludeSize`) is done **inside the includer**, so
  a companion only appears in `files` when it actually has to be written. There is therefore no
  separate flag check in the CLI extension or the manifest feature.
- The CLI wrapper `src/extensions/openapi/index.ts` writes `*.openapi.json` verbatim (no oversize
  stub logic — that applies only to `.md` pages) and registers the write for the manifest
  (`registerOpenapiCompanion`, stored on `run`). The companion always sits next to the generated
  `index.md`, so its leading page is the sibling `index` (the leading page cannot be recovered by
  stripping the suffix, because the companion name is derived from the spec).
- The build-manifest feature adds an `openapiCompanions` array to `yfm-build-manifest.json`:

```json
{
  "openapiCompanions": [
    {"leadingPage": "ru/api/index", "companionPath": "ru/api/petstore.openapi.json"}
  ]
}
```

`maxOpenapiIncludeSize`: if the companion is larger than the limit, the file is **not created**
(the viewer returns 404) and there is no manifest entry.

## Contract for the viewer

- The companion file lives in the same S3 tree as the built md2md sources:
  `prefix/rev/<revision>/<lang>/<companionPath>`.
- The manifest (`openapiCompanions`) is the source of truth for the html comment on the page — the
  viewer must use the exact `companionPath` (the file name is derived from the spec and cannot be
  reconstructed from the leading page).
- Access to the companion is restricted the same way as the leading page (`Restricted-Access`).

## Consequences / edge cases

- The default `ai.openapiCompanions: 'md'` means md2html does not write a companion by default;
  large specs in HTML stay `inline` (backward compatibility) until they hit
  `maxOpenapiIncludeSize` (then a stub).
- `renderMode: link` without a companion file → fallback to `inline` (no dead links).
- Only `components.schemas` are pruned; other groups (`securitySchemes`, `parameters`, …) are kept
  in full because they are referenced by name, not via `$ref`.

```

```
