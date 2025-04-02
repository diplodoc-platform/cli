# Diplodoc Algolia JSON Extension

This extension generates JSON files containing searchable content from your documentation, formatted for Algolia indexing. It extracts page content, headings, and metadata to create a structured dataset that can be easily imported into Algolia.

## Features

- Extracts page content, headings, and metadata
- Generates language-specific JSON files
- Supports multiple languages
- Preserves document structure and hierarchy
- Excludes pages marked with `noIndex` meta tag

## Installation

```bash
npm install @diplodoc/algolia-json-extension
```

## Configuration

Add the following to your documentation configuration:

```yaml
search:
  enabled: true
  provider: algolia-json
```

## Output

The extension generates JSON files in the `_search` directory of your built documentation:

- `_search/<lang>-algolia.json` - Contains an array of records for each language

Each record in the JSON file has the following structure:

```typescript
{
  objectID: string;      // Unique identifier (lang-path)
  title: string;         // Page title
  content: string;       // Full page content
  headings: string[];    // Array of page headings
  keywords: string[];    // Page keywords
  url: string;          // Page URL
  lang: string;         // Language code
}
```

## Usage with Algolia

1. Build your documentation with this extension enabled
2. Find the generated JSON files in the `_search` directory
3. Use these files to populate your Algolia indices
4. Configure Algolia search settings and ranking rules as needed

## Example

```yaml
# .diplodoc.yaml
search:
  enabled: true
  provider: algolia-json
```

After building, you'll find files like:
- `_search/en-algolia.json`
- `_search/ru-algolia.json`

Each file will contain an array of records ready for Algolia indexing. 