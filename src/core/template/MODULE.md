# core/template Module

This module provides the `Template` class for building HTML pages programmatically. It supports flexible composition of HTML documents with metadata, styles, scripts, CSP headers, and other elements.

## Overview

The `Template` class is a builder pattern implementation for creating HTML pages. It allows you to:

- Set page metadata (title, meta tags, canonical links, alternates)
- Add styles and scripts at different positions (leading, state, trailing)
- Configure Content Security Policy (CSP) headers
- Support RTL (Right-to-Left) languages
- Add custom body content and CSS classes
- Set favicon and other HTML head elements

## Architecture

### Core Class: `Template`

The main class that represents an HTML template builder.

**Constructor:**

```typescript
new Template(path: RelativePath, lang: string, signs: symbol[] = [])
```

- `path` — normalized path of the page (used for calculating base href)
- `lang` — language code for the page
- `signs` — array of symbols for template identification/classification (e.g., `__Entry__`, `__SinglePage__`)

### Key Features

1. **Method Chaining**: Most methods return `this`, allowing fluent API:

   ```typescript
   template.setTitle('Page Title').addStyle('styles.css').addBody('<div>Content</div>');
   ```

2. **RTL Support**: Automatically detects RTL languages and sets `dir="rtl"` attribute:

   - Supported languages: ar, arc, ckb, dv, fa, ha, he, khw, ks, ps, sd, ur, uz_AF, yi

3. **Positioned Resources**: Styles and scripts can be placed at different positions:

   - `leading` — in `<head>` before body
   - `state` — after body opening tag (for state data)
   - `trailing` — at end of `<body>` (for scripts that need DOM)

4. **CSP Integration**: Automatically generates nonces for inline scripts/styles based on CSP configuration

5. **HTML Escaping**: Provides `escape()` and `unescape()` methods for safe HTML content handling

## Naming Conventions

The Template class follows consistent naming conventions for methods:

- **`add*` prefix** — methods that can be called multiple times to accumulate values:

  - `addMeta()`, `addStyle()`, `addScript()`, `addBody()`, `addBodyClass()`, `addCsp()`, `addAlternates()`
  - Each call adds to existing collection/state

- **`set*` prefix** — methods that overwrite/set a single value:
  - `setTitle()`, `setFaviconSrc()`, `setCanonical()`
  - Each call replaces the previous value

## API Reference

### Basic Configuration

- `setTitle(title: string)` — sets page title
- `addMeta(props: Hash)` — adds meta tag
- `setCanonical(canonical: string)` — sets canonical link
- `addAlternates(alternates: Alternate[])` — adds alternate language links
- `setFaviconSrc(faviconSrc: string)` — sets favicon source

### Styling and Scripts

- `addStyle(style: string, options?: Partial<StyleInfo>)` — adds CSS style

  - `position`: `'leading'` | `'trailing'` (default: `'leading'`)
  - `inline`: boolean (default: `false`)
  - `attrs`: hash of HTML attributes

- `addScript(script: string, options?: Partial<ScriptInfo>)` — adds JavaScript script
  - `position`: `'leading'` | `'state'` | `'trailing'` (default: `'trailing'`)
  - `inline`: boolean (default: `false`)
  - `attrs`: hash of HTML attributes

### Body and Layout

- `addBody(body: string)` — adds content to body (multiple calls are concatenated)
- `addBodyClass(...classes: string[])` — adds CSS classes to `<body>` tag

### Security

- `addCsp(rules: Hash<string[]>)` — merges CSP directives
  - Automatically generates nonces for inline scripts/styles
  - Uses `csp-header` library for CSP generation

### Utilities

- `is(sign: symbol)` — checks if template has specific sign
- `escape(string: string)` — escapes HTML entities
- `unescape(string: string)` — unescapes HTML entities
- `dump()` — generates final HTML string

## Usage Examples

### Basic Template

```typescript
import {Template} from '~/core/template';

const template = new Template('/docs/index.html', 'en');

template
  .setTitle('My Documentation')
  .addMeta({name: 'description', content: 'Documentation site'})
  .addStyle('/assets/styles.css')
  .addScript('/assets/app.js', {position: 'trailing'})
  .addBody('<div id="content">Hello World</div>');

const html = template.dump();
```

### Template with CSP

```typescript
const template = new Template('/docs/page.html', 'en');

template
  .addCsp({
    'script-src': ["'self'", "'nonce-abc123'"],
    'style-src': ["'self'", "'nonce-abc123'"],
  })
  .addScript('console.log("hello")', {inline: true, position: 'trailing'});
```

### Template with State Data

```typescript
const template = new Template('/docs/page.html', 'en');

const stateData = JSON.stringify({user: 'admin'});

template.addScript(stateData, {
  inline: true,
  position: 'state',
  attrs: {id: 'initial-state'},
});
```

### RTL Language Support

```typescript
const template = new Template('/docs/page.html', 'ar'); // Arabic is RTL

template.setTitle('وثائق'); // Automatically sets dir="rtl"
```

## Integration Points

The Template module is used by:

1. **`output-html` feature** — generates HTML pages for documentation entries
2. **`singlepage` feature** — creates single-page documentation
3. **`pdf-page` feature** — generates HTML pages for PDF conversion
4. **Search service** — creates search page HTML
5. **Redirects service** — creates redirect page HTML

## Implementation Details

### Code Organization: Functional Helpers

The `dump()` method uses a declarative, functional approach where HTML template generation is broken down into small, focused helper functions. This pattern separates concerns and makes the code more maintainable:

**Positional Helpers** — filter arrays by position:

- `leading()`, `state()`, `trailing()` — filter styles/scripts by their position

**Rendering Helpers** — generate HTML fragments:

- `meta()` — generates `<meta>` tag from hash
- `alternate()` — generates `<link rel="alternate">` tag
- `csp()` — generates CSP meta tag
- `style()` — generates `<style>` or `<link rel="stylesheet">` tag
- `script()` — generates `<script>` tag (inline or external)

**Utility Helpers** — process data:

- `nonce()` — extracts nonce value from CSP directives
- `attributes()` — formats HTML attributes from hash

The `dump()` method composes these helpers declaratively in a template literal:

```typescript
${leading(scripts).map(script(this.csp)).join('\n')}
${this.meta.map(meta).join('\n')}
${csp(this.csp)}
```

This approach provides:

- **Separation of concerns** — each helper has a single responsibility
- **Testability** — helpers can be tested independently
- **Readability** — the template structure is clear and declarative
- **Reusability** — helpers can be reused across different contexts

### Base Href Calculation

The template automatically calculates `<base href>` based on the page path depth:

- Uses `getDepthPath()` utility to generate relative base path
- Ensures relative resource paths resolve correctly

### CSP Nonce Generation

When CSP rules include nonce directives (e.g., `'nonce-abc123'`), the template:

1. Extracts nonce value from CSP rule
2. Adds it as `nonce` attribute to inline scripts/styles
3. Ensures CSP-compliant inline code execution

### Default Body Classes

Templates start with default body classes: `['g-root', 'g-root_theme_light']`. These can be extended via `addBodyClass()`.

### Favicon Type Detection

The `getFaviconType()` utility automatically detects favicon MIME type from file extension:

- `.svg` → `image/svg+xml`
- `.png` → `image/png`
- `.ico` → `image/x-icon`
- `.jpg`/`.jpeg` → `image/jpeg`

## Testing

- `utils.spec.ts` — tests for `getFaviconType()` utility function
- Main template logic is tested through integration tests in features that use it

## Dependencies

- `lodash` — utility functions (e.g., `uniqBy`)
- `ts-dedent` — template literal formatting
- `csp-header` — CSP header generation
- Internal utilities from `~/core/utils`

## Related Modules

- `core/utils` — path normalization, depth calculation utilities
- `core/meta` — `Alternate` type definition
- Features that use Template for HTML generation
