# ADR-001: Dependent Extensions

## Status

Accepted

## Context

`@diplodoc/cli` supports extensions that can integrate with the CLI through hooks. There are two different integration patterns for extensions, determined by whether the extension is automatically initialized when CLI starts:

1. **Independent extensions** — extensions that are not automatically initialized by CLI and can declare `@diplodoc/cli` as a `peerDependency`
2. **Auto-initialized extensions** — extensions that CLI automatically imports and initializes on startup, requiring wrapper logic inside CLI

## Problem

When an extension needs to use CLI hooks, it typically needs to declare `@diplodoc/cli` as a `peerDependency` and import the necessary hooks. However, if CLI automatically imports and initializes an extension on startup, this creates a circular dependency:

- The extension package would depend on `@diplodoc/cli` (via `peerDependency`)
- `@diplodoc/cli` would import the extension package to initialize it
- This creates a circular dependency that breaks the build in NX monorepo

Examples where this occurs:

- `extensions/openapi` → CLI automatically imports and initializes it → wrapper in CLI needed
- `extensions/local-search` → CLI automatically imports and initializes it → wrapper in CLI needed

Examples where this is NOT needed:

- `extensions/algolia` → part of monorepo but completely independent, CLI doesn't auto-initialize it → can use `peerDependency` normally

## Decision

Use two distinct patterns for extension integration based on initialization approach:

### Pattern 1: Independent Extensions

For extensions that are **not automatically initialized** by CLI (regardless of whether they're in the monorepo or external):

1. Declare `@diplodoc/cli` as a `peerDependency` in the extension's `package.json`
2. Import necessary hooks from `@diplodoc/cli`:
   ```typescript
   import {getBuildHooks, getEntryHooks} from '@diplodoc/cli';
   ```
3. CLI does not import or initialize this extension automatically
4. Users explicitly configure and initialize the extension

Example: `extensions/algolia` — part of monorepo, but CLI doesn't auto-initialize it, so it can use `peerDependency`.

### Pattern 2: Auto-initialized Extensions

For extensions that CLI **automatically imports and initializes** on startup:

1. **Main business logic** remains in separate packages (e.g., `@diplodoc/openapi-extension`, `@diplodoc/search-extension`)
2. **Wrapper logic** that connects to CLI hooks is stored in `src/extensions/[extension-name]/` within `diplodoc/cli`
3. The wrapper directly imports hooks from CLI using relative imports or path aliases:
   ```typescript
   import {getHooks as getBaseHooks} from '@diplodoc/cli/lib/program';
   import {getHooks as getTocHooks} from '@diplodoc/cli/lib/toc';
   ```
4. **No `peerDependency`** on `@diplodoc/cli` in the extension package to avoid circular dependencies
5. The wrapper imports business logic from the extension package:
   ```typescript
   import {includer} from '@diplodoc/openapi-extension/includer';
   ```
6. CLI automatically imports and initializes the wrapper on startup

## Consequences

### Positive

✅ **Avoids circular dependencies** in NX monorepo when CLI auto-initializes extensions  
✅ **Clear separation** between business logic (in extension packages) and CLI integration (in CLI wrappers)  
✅ **Auto-initialized extensions are enabled by default** without additional installation  
✅ **Independent extensions** can use standard `peerDependency` pattern regardless of monorepo membership

### Negative

❌ **Two different patterns** to learn and maintain  
❌ **Wrapper code duplication** — each auto-initialized extension needs wrapper logic in CLI  
❌ **Less explicit dependencies** — auto-initialized extensions don't declare CLI dependency in package.json

### Neutral

- Auto-initialized extensions are always bundled with CLI
- Independent extensions require explicit installation and configuration, even if part of monorepo

## Examples

### Independent Extension Pattern

```typescript
// In package: @my-org/my-extension or extensions/algolia
// CLI does NOT automatically import this extension
import {getBuildHooks} from '@diplodoc/cli';

export class Extension implements IExtension {
  apply(program: BaseProgram) {
    getBuildHooks(program).BeforeRun.tap('MyExtension', (run) => {
      // Extension logic
    });
  }
}
```

### Auto-initialized Extension Pattern

```typescript
// In diplodoc/cli/src/extensions/openapi/index.ts
import {getHooks as getBaseHooks} from '@diplodoc/cli/lib/program';
import {getHooks as getTocHooks} from '@diplodoc/cli/lib/toc';
import {includer} from '@diplodoc/openapi-extension/includer';

export class Extension implements IExtension {
  apply(program: BaseProgram) {
    // Wrapper connects business logic to CLI hooks
    getBaseHooks(program).BeforeAnyRun.tap('OpenapiIncluder', (run) => {
      getTocHooks(run.toc)
        .Includer.for('openapi')
        .tapPromise('OpenapiIncluder', async (rawtoc, options) => {
          // Uses business logic from @diplodoc/openapi-extension
          const {toc, files} = await includer(run, options, from);
          // CLI-specific integration logic
        });
    });
  }
}
```

## Alternatives Considered

1. **Always use peerDependency** — Would create circular dependencies when CLI auto-initializes extensions
2. **Never auto-initialize extensions** — Would require users to manually configure every extension, reducing convenience
3. **Consolidate all auto-initialized extensions directly in CLI** — Would reduce modularity and make extensions harder to reuse or test independently

## Related Documents

- [Command Structure](./../AGENTS.md#command-structure) — Architecture of CLI commands
- [Architecture Quality Principles](./arch-quality.md) — Core architectural principles
