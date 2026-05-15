# core/meta Module

This module provides metadata management for documentation pages. It handles page metadata, resources (scripts, styles, CSP), alternate language links, and VCS metadata.

## Overview

The `core/meta` module manages per-page metadata in the CLI build process. It stores, merges, and normalizes metadata for each document, providing a centralized service for accessing and modifying page information.

Key responsibilities:

- Storing and retrieving metadata by document path
- Merging metadata from multiple sources
- Normalizing metadata (removing duplicates, empty values)
- Managing page resources (scripts, styles, CSP directives)
- Handling alternate language links
- Integrating with VCS metadata (authors, contributors, modification times)

## Architecture

### Core Service: `MetaService`

The main service class that manages metadata storage and operations. Implements a **Service/Repository pattern** for managing state (not a Builder pattern - methods don't return `this` for chaining).

**Constructor:**

```typescript
new MetaService(run: Run<Config>)
```

The service uses a `Map<NormalizedPath, Meta>` to store metadata indexed by normalized document paths.

### Key Features

1. **Path-based Storage**: Metadata is stored and retrieved by document path (paths are normalized)
2. **Incremental Merging**: Metadata can be added incrementally from multiple sources
3. **Automatic Normalization**: Removes duplicates, empty arrays, and empty objects during dump
4. **Resource Management**: Handles scripts, styles, and CSP directives separately
5. **Hook System**: Provides hooks for extending metadata processing

## Usage Examples

### Basic Metadata Management

```typescript
import {MetaService} from '~/core/meta';

const metaService = new MetaService(run);

// Get metadata (creates if doesn't exist)
const meta = metaService.get('/docs/page.md');

// Set metadata
metaService.set('/docs/page.md', {
  title: 'My Page',
  description: 'Page description',
});

// Add metadata (merges with existing)
metaService.add('/docs/page.md', {
  keywords: ['docs', 'tutorial'],
  noIndex: false,
});
```

### Adding Resources

```typescript
// Add scripts and styles
metaService.addResources('/docs/page.md', {
  script: ['/assets/app.js'],
  style: ['/assets/styles.css'],
  csp: [
    {
      'script-src': ["'self'", "'nonce-abc123'"],
      'style-src': ["'self'"],
    },
  ],
});
```

### Adding Custom Meta Tags

```typescript
metaService.addMetadata('/docs/page.md', {
  'og:title': 'My Page',
  'og:description': 'Page description',
  'twitter:card': 'summary',
});
```

### Adding Alternate Links

```typescript
metaService.addAlternates('/docs/page.md', [
  {href: '/docs/page.html', hreflang: 'en'},
  {href: '/docs/ru/page.html', hreflang: 'ru'},
]);
```

### Dumping Normalized Metadata

```typescript
// Get final, normalized metadata
const normalized = await metaService.dump('/docs/page.md');

// Result: cleaned, deduplicated, ready for use
console.log(normalized.title, normalized.script, normalized.alternate);
```

## Integration Points

The MetaService is used by:

1. **Build Run** — created as `run.meta` service
2. **MarkdownService** — reads metadata from YFM frontmatter
3. **LeadingService** — manages metadata for leading pages
4. **TocService** — has reference to meta service
5. **VcsService** — integrates VCS metadata (authors, contributors, etc.)
6. **EntryService** — uses metadata for page generation
7. **Output features** — use metadata for HTML generation

## Hook System

The module provides hooks for extending metadata processing:

### `Dump` Hook

Executed during `dump()` to transform metadata before returning:

```typescript
getMetaHooks(metaService).Dump.tap('MyExtension', (meta, path) => {
  // Transform metadata
  meta.customField = 'value';
  return meta;
});
```

Hook signature: `AsyncSeriesWaterfallHook<[Meta, NormalizedPath]>`

## Implementation Details

### Path Normalization

All paths are normalized using `normalizePath()` before storage/retrieval:

- Ensures consistent path representation
- Handles relative/absolute path variations
- Used as Map keys for storage

## Naming Conventions

Methods follow consistent naming:

- **`get*` prefix** — returns value (e.g., `get()`)
- **`set*` prefix** — sets/overwrites value (e.g., `set()`)
- **`add*` prefix** — adds/merges values (e.g., `add()`, `addResources()`, `addMetadata()`)
- **`dump*` prefix** — generates final output (e.g., `dump()`)

## Related Modules

- `core/vcs` — VCS metadata types and integration
- `core/template` — uses `Alternate` type for HTML generation
- `core/markdown` — extracts metadata from YFM frontmatter
- `core/leading` — manages metadata for leading pages
- Features that consume metadata for output generation
