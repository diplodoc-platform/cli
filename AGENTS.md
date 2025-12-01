# AGENTS.md

This file contains instructions for AI agents working with the `@diplodoc/cli` project.

## Module Documentation

If a module contains a `MODULE.md` file, it is considered part of the module's context and should be consulted when working with that module. These files provide module-specific documentation, architecture decisions, and implementation details that complement the general project documentation.

## Project Description

`@diplodoc/cli` is a CLI tool for building documentation from Markdown files with Yandex Flavored Markdown (YFM) support. The project allows you to build full-fledged documentation with navigation, internal transitions, and full YFM support.

## Project Structure

### Main Directories

- `src/` — source code of the project
  - `commands/` — CLI commands (build, publish, translate)
  - `core/` — core logic (config, logger, markdown, toc, etc.)
  - `extensions/` — extensions (openapi, generic-includer, local-search)
  - `steps/` — **DEPRECATED** processing steps (do not add new code here)
- `build/` — compiled code (generated during build)
- `lib/` — libraries (generated during build)
- `tests/` — project tests
  - `e2e/` — end-to-end tests
  - `cases/` — test cases
  - `fixtures/` — test fixtures
  - `mocks/` — test mocks
- `schemas/` — JSON/YAML schemas for fundamental project data structures

### CLI Commands

1. **build** — main command for building documentation

   - Location: `src/commands/build/`
   - Subcommands and features are located in `src/commands/build/features/`

2. **publish** — publishing documentation

   - Location: `src/commands/publish/`

3. **translate** — translating documentation
   - Location: `src/commands/translate/`

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js >= 22
- **Testing**: Vitest
- **Build**: esbuild
- **Linting**: ESLint (via `@diplodoc/lint`)

## Development Commands

```bash
# Build project
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run E2E tests
npm run e2e

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix
```

## Working with Code

### Imports

The project uses path aliases:

- `~/` — points to `src/`
- Example: `import {Program} from '~/core/program'`

### Architecture

1. **Program** — main class that manages command execution

   - Located in `src/commands/index.ts`
   - Uses decorator pattern (`@withConfigDefaults`)

2. **Commands** — CLI commands inherit from `BaseProgram`

   - Each command can have its own options, hooks, and handlers

3. **Features** — functionality is grouped into features

   - Examples: `output-html`, `search`, `watch`, etc.
   - Each feature can have its own configuration and hooks

4. **Hooks** — hook system for extending functionality
   - Uses `tapable` library

## Command Structure

Every command should follow a well-defined structure to ensure maintainability and separation of concerns.

### Command Organization

- **Main logic** is concisely gathered in `index.ts`
- **Implementation** is divided into separate functionalities through `features/`
- **Features** do not depend on each other
- A command can extract part of functionality into **services**, located in `services/` directory
- **Services** do not depend on each other
- If multiple features need to use the same computed data, such data (and logic for working with them) should be extracted into a service
- If multiple features use the same logic for processing their own data, such logic should likely be extracted into a common utility in the `utils/` directory at the same level as `features/` and `services/`
- **Utils** may depend on each other
- **Utils** cannot depend on anything outside of `utils/`

### Command Files

- **`index.ts`** — main entry point with concise core logic
- **`hooks.ts`** — command hooks for external interaction are always described here
- **`config.ts`** — command and feature configurations for CLI are described here
- **`types.ts`** — public types are always described here and exported from the module via `index.ts`
  - Only public types are exported from `types.ts`
  - Common types used only at the module level should be described next to the entity that produces these types

### Features

Features represent separate functionalities of a command:

- Located in `features/[feature-name]/` directory
- Features are independent and do not depend on each other
- Each feature can have its own:
  - `index.ts` — feature implementation
  - `config.ts` — feature configuration
  - `hooks.ts` — feature hooks (optional)

### Services

Services contain shared business logic:

- Located in `services/[service-name]/` directory
- Services are independent and do not depend on each other
- Services are used when multiple features need shared computed data or logic
- Services can have:
  - `index.ts` — service implementation
  - `types.ts` — service-specific types
  - `hooks.ts` — service hooks (optional)

### Utils

Utility functions for shared logic:

- Located in `utils/` directory at the same level as `features/` and `services/`
- Utils may depend on each other
- Utils cannot depend on anything outside of `utils/` (no dependencies on features, services, or external modules)
- Use utils when multiple features need the same data processing logic

### Core Modules

The `core/` directory contains logic common to all commands:

- Most often this logic is organized into **services**
- But **base (abstract) classes** are also possible, for example `BaseProgram`
- Used in external extensions in a fully bundled form, i.e., dependencies from `core` are fully bundled

#### Core Structure Rules

The same rules apply to `core/` as to commands:

- **`types.ts`** — only public types are exported
- **`hooks.ts`** — hooks are always described here
- Service concept applies — logic is organized into services
- Common types used only at the module level should be described next to the entity that produces these types

### Code Conventions

1. **File naming**:

   - Type files: `types.ts`
   - Configuration: `config.ts`
   - Main module file: `index.ts`
   - Tests: `*.spec.ts` or `*.test.ts`

2. **Comments and documentation**:

   - **All code comments must be in English**
   - **All documentation files (ADR, AGENTS.md, README, etc.) must be in English**
   - JSDoc comments are used for exported functions/classes

3. **Variables**:
   - Avoid single-letter variable names
   - Don't use overly long variable names

### Testing

1. **Unit tests**:

   - Uses Vitest
   - Tests are next to code or in `__tests__/`
   - Prefer using `vitest-when` for mocking instead of standard `mockImplementation`

2. **E2E tests**:

   - Located in `tests/e2e/`
   - Snapshots are used for output verification

3. **Test fixtures**:
   - Data preparation (Arrange) should be grouped into helper functions when the same setup is repeated across tests

### Working with Playwright (if used)

- Prefer using `page.goto()` instead of `page.evaluate()` for navigation
- Avoid `page.locator(selector).first()` — use more explicit and reliable selectors

## Key Modules

### Core Modules

- `core/config/` — configuration management
- `core/logger/` — logging
- `core/markdown/` — Markdown processing
- `core/toc/` — table of contents management
- `core/vcs/` — version control systems integration
- `core/program/` — base program and extension system

### Build Command

Main build logic is located in:

- `src/commands/build/handler.ts` — command handler
- `src/commands/build/run.ts` — command execution
- `src/commands/build/features/` — various build features

### Extensions

Extensions integrate with CLI through hooks. There are two integration patterns based on initialization approach:

1. **Independent extensions** — extensions that are not automatically initialized by CLI (can use `peerDependency` regardless of monorepo membership)
2. **Auto-initialized extensions** — extensions that CLI automatically imports and initializes on startup (require wrapper logic in `src/extensions/` to avoid circular dependencies)

For details, see [ADR-001: Dependent Extensions](./adr/ADR-001-dependent-extensions.md).

Auto-initialized extensions:

- `extensions/openapi/` — OpenAPI support (wrapper for `@diplodoc/openapi-extension`)
- `extensions/generic-includer/` — generic includer
- `extensions/local-search/` — local search (wrapper for `@diplodoc/search-extension`)
- `extensions/github-vcs/` — GitHub integration
- `extensions/arcadia-vcs/` — Arcadia integration

## Configuration

The project supports configuration via:

1. `.yfm` file (YAML)
2. Command-line arguments
3. Environment variables

Main configuration files:

- `YFM_CONFIG_FILENAME` — configuration file name (usually `.yfm`)
- Schemas in `schemas/` — JSON/YAML schemas for validation

### Schemas Directory

The `schemas/` directory stores schemas for fundamental project data structures:

- **`toc-schema.yaml`** — schema for documentation table of contents (`toc.yaml`)

  - Defines the structure of navigation and document hierarchy

- **`presets-schema.yaml`** — schema for template variables file (`presets.yaml`)

  - Defines variables used for document templating

- **`leading-schema.yaml`** — schema for "leading" (overview) pages structure

  - Defines the structure of summary/overview pages in documentation

- **`page-constructor-schema.yaml`** — schema for Page Constructor format
  - Defines the format for generating HTML pages from YAML descriptions
  - Based on [@gravity-ui/page-constructor](https://gravity-ui.com/ru/libraries/page-constructor)
  - Used to create pages from JSON/YAML block-based configurations

## Additional Resources

- `README.md` — main documentation
- `CONTRIBUTING.md` — contributor guide
- `CHANGELOG.md` — change history
- `adr/arch-quality.md` — architectural quality principles
- `adr/ADR-001-dependent-extensions.md` — architecture decision record for extension integration patterns

### Module Documentation

- **`MODULE.md`** — if present in a module directory, this file contains module-specific documentation and is part of the module's context for AI agents
  - Provides module architecture, implementation details, and usage patterns
  - Should be consulted when working with that specific module
  - Example locations: `src/core/MODULE.md`, `src/commands/build/MODULE.md`, etc.

## Common Tasks

### Adding a New Command

1. Create directory in `src/commands/[command-name]/`
2. Create command class inheriting from `BaseProgram`
3. Register command in `src/commands/index.ts`

### Adding a New Feature to Build

1. Create directory in `src/commands/build/features/[feature-name]/`
2. Implement feature with hooks
3. Register feature in `src/commands/build/index.ts`

### Adding a New Extension

1. Create directory in `src/extensions/[extension-name]/`
2. Implement extension
3. Register in project configuration

## Important Notes

1. The project uses a monorepo (nx)
2. All changes must pass linter and tests
3. Types must be correct (checked via `npm run typecheck`)
4. When working with VCS (GitHub/Arcadia), token configuration is required in `.env` or `.yfm`
5. **All comments and documentation files (ADR, AGENTS.md, README, etc.) must be written in English**
6. **The `src/steps/` directory is deprecated. Do not add new code there. If you need to fix existing code, carefully move it to `commands/build/features/`**
