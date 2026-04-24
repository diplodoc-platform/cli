# ADR-007: Built-in Text-Selection Feedback Extension

## Status

Proposed

## Context

Diplodoc CLI supports a hook-based extension system that allows third parties to inject logic into the build pipeline. Until now, text-selection feedback (a form that appears when a reader highlights text and allows them to report issues) existed only as a project-specific script outside of the CLI, making it unavailable to other Diplodoc users and requiring each project to maintain its own copy.

The feature consists of two parts:

1. **Server side** — extension logic that runs during the CLI build (hook registration, config validation, HTML script injection, asset copying)
2. **Browser side** — an IIFE bundle that runs in the reader's browser (text-selection tracking, floating button, feedback form, Yandex Metrica integration)

Bundling browser-side code inside a Node.js CLI tool creates a build-system tension: the Node.js compiler must not see DOM types, while the browser bundle must have them. The project uses esbuild for bundling and TypeScript for type checking.

## Problem

- The feedback feature is generally useful for any documentation project built with Diplodoc, not just specific internal projects.
- As an external script, it was not configurable through the standard Diplodoc CLI interface (`.yfm` config file or CLI arguments).
- Each project that wanted the feature had to maintain its own copy of the code, including the browser build pipeline.
- The browser code required a separate compilation step with DOM type definitions that would conflict with the Node.js TypeScript configuration.

## Decision

### 1. Port the feature as a built-in extension

The feedback extension is placed at `src/extensions/feedback/` inside the CLI repository and auto-initialized following the pattern established in [ADR-001](./ADR-001-dependent-extensions.md) (Pattern 2: auto-initialized extensions). It is registered in `src/commands/build/index.ts` alongside other built-in extensions.

Only the generic text-selection feedback form is ported. Project-specific UI elements (e.g., alternative feedback forms, support-chat buttons) are left out and remain the responsibility of individual projects.

### 2. Separate browser and Node.js TypeScript compilation

Browser-side code lives under `src/extensions/feedback/browser/` and has its own `tsconfig.json` that:

- includes `"lib": ["ES2019", "DOM"]` for browser globals
- sets `"noEmit": true` (type-checking only; esbuild handles transpilation)

The root `tsconfig.json` excludes the browser directory via `"exclude": ["src/extensions/feedback/browser"]` to prevent DOM type leakage into the Node.js build.

### 3. Dedicated browser bundle build step

A `browser()` function is added to `scripts/build.cli.js` using plain `esbuild` (not the `@diplodoc/lint` infra wrapper, which adds Node.js-specific plugins):

```javascript
const browser = (entry, outfile) =>
  esbuild.build({
    tsconfig: './src/extensions/feedback/browser/tsconfig.json',
    platform: 'browser',
    target: ['es2019'],
    format: 'iife',
    bundle: true,
    minify: true,
    sourcemap: false,
    entryPoints: [entry],
    outfile: `build/${outfile}`,
  });
```

The compiled bundle is written to `build/extensions/feedback/resources/feedback.js` and copied to each output site directory during the `AfterRun` hook.

### 4. Configuration interface

The extension adds a `--text-feedback <url>` CLI flag and a corresponding `.yfm` config key that supports two forms:

```yaml
# Short form — endpoint URL only
textFeedback: https://example.com/feedback

# Full form — with optional Yandex Metrica counters
textFeedback:
  endpoint: https://example.com/feedback
  metrika:
    counterId: 12345678
    goals:
      button: my-feedback-button
      submit: my-submit
      cancel: my-cancel
```

Validation (non-empty endpoint, positive integer `counterId`) is performed in the `Config` hook and extracted into a standalone `validateConfig()` function in `config.ts` to keep it testable independently of the hook infrastructure.

### 5. HTML injection via Page hook

In `BeforeRun.for('html')`, the extension taps `getEntryHooks(run.entry).Page` to:

- Add the browser bundle as a `<script defer>` in the `leading` position
- Add an inline `<script>` in the `state` position that calls `window.feedbackExtensionInit({...})` with the serialized config
- Add a `connect-src` CSP directive for the endpoint origin

`program.config` (typed with the extension's `Config` augmentation) is used instead of `run.config` because the latter is typed as the core `BuildConfig` and does not carry the `textFeedback` field.

## Consequences

### Positive

✅ Text-selection feedback is available to all Diplodoc users out of the box — no extra packages or scripts required  
✅ Configured through the standard `.yfm` / CLI interface, consistent with all other build options  
✅ Browser and Node.js compilation are cleanly separated; neither leaks types into the other  
✅ `validateConfig()` is independently testable without mocking the full hook infrastructure  
✅ Follows the existing auto-initialized extension pattern (ADR-001 Pattern 2)

### Negative

❌ Browser bundle build step adds complexity to `scripts/build.cli.js`  
❌ The browser bundle is always shipped with the CLI, even for projects that do not use the feature  
❌ UI strings in the browser form are in Russian; there is no i18n mechanism yet

### Neutral

- The extension is a no-op when `textFeedback` is absent from the config — no scripts are injected and no files are copied
- Yandex Metrica integration is optional; the form works without it

## Alternatives Considered

1. **Keep as an external project-specific script** — the feature remains unavailable to other Diplodoc users and each project must maintain its own build pipeline for the browser bundle.

2. **Publish as a separate `@diplodoc/feedback-extension` npm package** — would follow the independent extension pattern (ADR-001 Pattern 1). Rejected because it requires users to install and configure an extra package, and the feature is general enough to be included by default. It would also require the package to declare `@diplodoc/cli` as a peer dependency, adding maintenance overhead.

3. **Compile browser code with the main esbuild pass** — rejected because the main esbuild build targets Node.js and does not include DOM types. A separate pass with `platform: 'browser'` is the correct approach.

## Related Documents

- [ADR-001: Dependent Extensions](./ADR-001-dependent-extensions.md) — defines the auto-initialized extension pattern used here
- [`src/extensions/feedback/config.ts`](./../src/extensions/feedback/config.ts) — config types, CLI option, `resolveTextFeedback`, `validateConfig`
- [`src/extensions/feedback/index.ts`](./../src/extensions/feedback/index.ts) — extension class with hook registrations
- [`src/extensions/feedback/browser/`](./../src/extensions/feedback/browser/) — browser-side bundle source
- [`scripts/build.cli.js`](./../scripts/build.cli.js) — build script with the `browser()` step
