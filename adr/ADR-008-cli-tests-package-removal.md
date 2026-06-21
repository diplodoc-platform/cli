# ADR-008: Removing the standalone `@diplodoc/cli-tests` package

## Status

Implemented

## Context

The CLI e2e test harness used to live in `packages/cli/tests` as a **separate npm package** `@diplodoc/cli-tests` with its own `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts` and `bin.mjs` launcher.

This harness is consumed in two places:

1. **Internally** — `@diplodoc/cli` runs it as its own e2e suite.
2. **Externally** — the post-build pipeline in `yfm-custom-plugins` (Arcadia) builds the CLI binary and runs the same harness against custom plugins, mixing the CLI's own e2e specs with project-local spec files.

Because tests and the artifact under test (`@diplodoc/cli`) were published as **two independently versioned packages**, the external loop could pin mismatched versions of `cli` and `cli-tests`. This already broke prerelease scenarios: the binary and the test code/snapshots could come from different builds.

PR 1618 set the base direction (merge the harness into the CLI, drop the source-mode runner, split unit/integration configs). This ADR records the final decision, including the parts PR 1618 did not cover that are required for the external consumer to keep working.

## Problem

- **Version drift** between `@diplodoc/cli` and `@diplodoc/cli-tests` — the core motivation.
- Duplicated package machinery (second lockfile, tsconfig, vitest config, bin launcher).
- Two run modes (source vs binary) where only the binary mode reflects what ships.
- Release pipeline published an extra test package.
- External consumer depended on `@diplodoc/cli-tests` for fixtures and the runner.
- Module-resolution trap: the test toolchain (`vitest`, `strip-ansi`) must be resolvable **from the location of `@diplodoc/cli`**, not from the consumer's `tests/` sub-project.
- Snapshot fragility: bundle-list snapshots reacted to `@diplodoc/client` internal chunking, which differs between a locked `npm ci` (GitHub) and a floating `npm install` (Arcadia workspace).

## Decision

### 1. One versioned artifact

Delete the `@diplodoc/cli-tests` package identity. `packages/cli/tests` is now plain source inside `@diplodoc/cli`. Removed: the tests' `package.json`, `package-lock.json`, root `bin.mjs`, and the standalone `tests/vitest.config.ts`. There is exactly one version: the CLI's.

### 2. Binary-only e2e contract

The canonical run target is the built binary `build/index.js`. The source-mode runner (`fixtures/runners/source.ts`) is removed; a single `fixtures/runner.ts` drives the binary. The binary path is overridable via the `DIPLODOC_BINARY_PATH` env var (used by the external loop, which builds the binary via `pkg`).

### 3. Single test entrypoint with split configs

Test scripts live in `packages/cli/package.json`. Vitest config is split:

- `vitest.units.config.ts` — unit tests (`npm test`).
- `vitest.integration.config.ts` — e2e (`npm run e2e`), including external spec dirs via `DIPLODOC_TEST_PATHS`.

`typecheck` runs `tsc --noEmit && tsc --noEmit -p tests/tsconfig.json`. A dedicated `tests/tsconfig.json` gives the tests vanilla Node typings, isolating them from the CLI's branded ambient types (e.g. `AbsolutePath` in `src/globals.d.ts`).

### 4. Publish the harness with the CLI

`@diplodoc/cli` publishes the harness so the external consumer runs **the same version**:

- `files` includes `"tests"` and `"vitest.integration.config.ts"`.
- `exports` exposes `"./tests/fixtures"`.

### 5. Test-toolchain contract (optional peer dependencies)

`vitest.integration.config.ts` does `import {defineConfig} from 'vitest/config'`, and fixtures import `vitest` / `strip-ansi`. Node resolves these **relative to the `@diplodoc/cli` location**, then walks up `node_modules`. So:

- **CLI side:** `vitest` and `strip-ansi` are declared as `peerDependencies` with `peerDependenciesMeta.optional: true`. Normal installs are not bloated, but the contract "to run the e2e fixtures, install these alongside" is explicit. (`execa`, `glob` stay regular runtime deps — always present.)
- **Consumer side:** the toolchain must live in the **same `node_modules` tree where `@diplodoc/cli` resolves** — i.e. the consumer's **root** `package.json`, never in a `tests/` sub-project (whose `node_modules` is not on the CLI's resolution chain).

### 6. External consumer (`yfm-custom-plugins`)

- Root `package.json` `devDependencies`: `vitest`, `strip-ansi`, `@diplodoc/tsconfig`.
- `tests/package.json` keeps only `execa` (the launcher dep); no `vitest` there, to avoid two vitest instances.
- `tests/run-tests.mjs` resolves both the config (`<cli>/vitest.integration.config.ts`) and `vitest` itself through `createRequire` anchored at the CLI package, so config, fixtures and runner share one vitest instance.
- Fixture imports switched from `@diplodoc/cli-tests/fixtures` to `@diplodoc/cli/tests/fixtures`.
- Prerelease branch: `scripts/utils` runs `npm pkg set "dependencies.@diplodoc/cli=*"` so the `extensions/cli` workspace is linked — guaranteeing the binary, `vitest.integration.config.ts`, specs and `build/manifest.json` all come from the same branch build.
- `scripts/update` runs `npm ci --include=dev` so the root dev toolchain reaches root `node_modules`.

### 7. Snapshot robustness against client chunking

Bundle snapshots must not depend on the exact `@diplodoc/client` patch version. `fixtures/test.ts#bundleless()` now strips **dynamic (numeric-id) client chunks** (e.g. `_bundle/572-<hash>.css`, `_bundle/189-<hash>.js`) from both the file list and content references (script/link tags, `cssLink` arrays). Named bundles (`app`, `vendor`, `search`, `*-extension`) are still asserted.

A guard short-circuits when the text contains no chunk reference, which is essential because `bundleless()` is also applied to **binary** asset content — the punctuation cleanup would otherwise corrupt random `,,`/`[,`/`,]` byte sequences.

## Consequences

### Positive

✅ **No version drift** — tests and the binary are one artifact, one version.
✅ **Less machinery** — one lockfile, one tsconfig graph, no second package or bin launcher.
✅ **Honest e2e** — only the shipped binary is exercised.
✅ **Simpler release** — no separate test-package publish step.
✅ **Stable snapshots** — immune to `@diplodoc/client` patch-level chunking differences between GitHub (`npm ci`, locked) and Arcadia (`npm install`, floating).

### Negative

❌ **Explicit toolchain contract** — consumers must place `vitest`/`strip-ansi` in the tree where `@diplodoc/cli` resolves (documented as optional peer deps). A misplaced toolchain fails with `Cannot find module 'vitest'`.
❌ **Larger published package** — the `tests/` tree (specs, mocks, fixtures) ships with the CLI.

### Neutral

- Bundle snapshots no longer record dynamic chunk names; only named bundles are meaningful in them.
- The external consumer keeps a thin local launcher (`run-tests.mjs`) instead of importing a published bin.

## Implementation Details

### CLI package surface (`packages/cli/package.json`)

```jsonc
{
  "files": ["lib", "build", "assets", "schemas", "tests", "vitest.integration.config.ts"],
  "exports": {
    "./tests/fixtures": "./tests/fixtures/index.ts",
    // ...
  },
  "peerDependencies": {"strip-ansi": "^7.1.0", "vitest": "^3.2.1"},
  "peerDependenciesMeta": {
    "strip-ansi": {"optional": true},
    "vitest": {"optional": true},
  },
}
```

### Dynamic-chunk normalization (`packages/cli/tests/fixtures/test.ts`)

```typescript
const DYNAMIC_CHUNK = String.raw`_bundle\/\d+-[a-f0-9]{12,16}(?:\.[a-z0-9]+)*\.[a-z0-9]+`;

function stripDynamicChunks(text: string): string {
  // Guard: also applied to binary asset content; never mutate it.
  if (!new RegExp(DYNAMIC_CHUNK).test(text)) {
    return text;
  }
  // remove <script>/<link> tags and JSON array elements referencing the chunk,
  // then tidy leftover array punctuation.
  // ...
}
```

The emptied file-list entries are dropped via `.filter(Boolean)` in `fixtures/file.ts#compareDirectories()`.

### External launcher (`yfm-custom-plugins/tests/run-tests.mjs`)

```javascript
const cliRoot = dirname(require.resolve('@diplodoc/cli/package'));
const configPath = join(cliRoot, 'vitest.integration.config.ts');
// resolve vitest from the CLI's own module graph, not from tests/
const cliRequire = createRequire(join(cliRoot, 'package.json'));
const vitestPath = cliRequire.resolve('vitest');
```

## Files Changed

CLI repo (`packages/cli`):

- `package.json` — `files`, `exports`, `peerDependencies(+Meta)`, test scripts, `typecheck`.
- `vitest.units.config.ts` (renamed from `vitest.config.mjs`), `vitest.integration.config.ts` (new, `DIPLODOC_TEST_PATHS`).
- `tests/tsconfig.json` (new, vanilla Node typings).
- `tests/fixtures/runner.ts` (consolidated, restores `DIPLODOC_BINARY_PATH`), `cli.ts`, `file.ts`, `test.ts`, `index.ts`; removed source/binary runner split.
- `tests/fixtures/test.ts` + `tests/fixtures/file.ts` — dynamic-chunk normalization, binary-safe guard, `.filter(Boolean)`.
- `tests/e2e/__snapshots__/bundles.spec.ts.snap` — regenerated (chunk-free).
- `.github/workflows/integration-tests.yml` — uses `npm run e2e`.
- `.github/workflows/release.yml` — dropped `cli-tests` publish steps (stable + prerelease).
- `.eslintignore` / `.prettierignore` — config file renames.
- Deleted: `tests/package.json`, `tests/package-lock.json`, `tests/bin.mjs`, `tests/vitest.config.ts`, old `tests/tsconfig.json`, `tests/fixtures/runners/source.ts`.

External consumer (`yfm-custom-plugins`, Arcadia — separate VCS, described for completeness):

- Root `package.json` dev toolchain; `tests/package.json` reduced to `execa`; `tests/run-tests.mjs` createRequire-based resolution; fixture imports retargeted; `scripts/utils` (`npm pkg set @diplodoc/cli=*`); `scripts/update` (`npm ci --include=dev`).

## Alternatives Considered

1. **Keep the separate `@diplodoc/cli-tests` package** — rejected: this is the source of the version drift the ADR exists to remove.
2. **Pin `@diplodoc/client` to a fixed version everywhere** — rejected for the snapshot problem: requires re-pinning on every client bump and still leaks bundler internals into snapshots. Robust normalization is preferred.
3. **Publish a `diplodoc-cli-test` bin from `@diplodoc/cli`** — rejected: the external loop must mix CLI specs with project-local specs and resolve vitest from the CLI context; a thin local launcher (`run-tests.mjs`) is simpler and keeps that control on the consumer side.
4. **Declare the toolchain as plain `devDependencies` (no peer deps)** — rejected: devDeps are not installed for consumers, so the contract would be implicit and break with `Cannot find module 'vitest'`. Optional peer deps make it explicit without bloating normal installs.

## Related Documents

- [ADR-002: Multithreading build](./ADR-002-multithreading-build.md) — produces the `-jN` bundle output exercised by `bundles.spec.ts`.
