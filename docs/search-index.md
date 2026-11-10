# External search indexing

Build a backend-neutral search corpus, then upload it independently of the browser search provider:

```sh
yfm build -i ./docs -o ./build --search-index
yfm search-index -i ./build --provider opensearch \
  --endpoint https://search.example.com --index-name docs
```

`--search-index` is an opt-in build flag for HTML snapshot output; watch mode is unsupported.
It also works when search is
disabled or uses a local, Algolia, or external provider. Building exports data and never
contacts a search backend. The separate command can be rerun without rebuilding.
The existing Algolia extension's `index` command continues to work independently.

## Exported documents

`_search/documents.json` contains `{schemaVersion: 1, documents: [...]}`. Each document has:

| Field      | Meaning                                                                        |
| ---------- | ------------------------------------------------------------------------------ |
| `id`       | Stable SHA-256 of the normalized source path                                   |
| `path`     | Source path relative to the documentation root                                 |
| `url`      | Published HTML link relative to the documentation root, respecting pretty URLs |
| `lang`     | Documentation language                                                         |
| `title`    | Resolved article title                                                         |
| `content`  | Resolved plain text without navigation, scripts or styles                      |
| `headings` | Article title and section headings                                             |
| `keywords` | Resolved keywords                                                              |
| `tags`     | Public tags, excluding names starting with `_`                                 |

Entries marked `noIndex` are excluded. Hidden entries follow `search.hiddenPolicy` and
the existing TOC inheritance rules. A leading page without article HTML contributes its
title and metadata description. The corpus contains the content selected by the build's
variables, conditions and includes. A new export replaces the previous snapshot, so
removed pages are absent. Export is skipped if the build reports errors.

## OpenSearch

`--index-name` names an **alias**, rather than an existing concrete index. On first use,
the alias is created. Reindexing creates a fresh physical index, uploads documents in
batches, checks every bulk item, refreshes the new index and atomically moves the alias.
An empty corpus moves the alias to an empty index, removing obsolete results as well.
The endpoint may include a proxy path prefix.

The cluster account needs permission to read aliases, create indexes, bulk index,
refresh, update aliases and delete failed staging indexes. Previously published physical
indexes are retained for rollback; manage their retention on the cluster. A failed bulk
upload leaves the live alias intact. If the alias switch has an ambiguous network
outcome, the new index is retained because it may already be live.

Provide private authentication through the environment or a command flag. The value is
the complete HTTP Authorization header, supporting the cluster's configured Basic,
Bearer or other authorization scheme:

```sh
export SEARCH_INDEX_AUTHORIZATION='Bearer <token>'
yfm search-index -i ./build --endpoint https://search.example.com --index-name docs
```

Connection options are read from CLI flags and environment variables, independently of
the public `.yfm` search configuration:

| Flag              | Environment variable         | Default                                  |
| ----------------- | ---------------------------- | ---------------------------------------- |
| `--provider`      | `SEARCH_INDEX_PROVIDER`      | `opensearch`                             |
| `--endpoint`      | `SEARCH_INDEX_ENDPOINT`      | Required for OpenSearch                  |
| `--index-name`    | `SEARCH_INDEX_NAME`          | `docs`                                   |
| `--authorization` | `SEARCH_INDEX_AUTHORIZATION` | No authorization header                  |
| `--options`       |                              | Optional JSON object for custom indexers |

The browser search service remains responsible for querying OpenSearch and converting
results into its public search response. Indexing credentials never enter the corpus or
browser configuration. The built-in adapter uses the [OpenSearch Bulk API](https://docs.opensearch.org/latest/api-reference/document-apis/bulk/).

## Custom indexers

Pass a local CommonJS/ESM module or installed package as `--provider`. Resolution starts
in the current working directory. Export an object implementing `index(corpus, options)`
as the default export, or export a named `index` function:

```js
// custom-indexer.mjs
export async function index(corpus, {endpoint, authorization, indexName, options}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authorization ? {Authorization: authorization} : {}),
    },
    body: JSON.stringify({indexName, documents: corpus.documents, ...options}),
  });
  if (!response.ok) throw new Error(`Index upload failed: ${response.status}`);
}
```

```sh
yfm search-index -i ./build --provider ./custom-indexer.mjs \
  --endpoint https://search.example.com/import --options '{"version":"v2"}'
```

TypeScript adapters can import `SearchIndexer`, `SearchCorpus`, `SearchDocument` and
`SearchIndexOptions` from `@diplodoc/cli`. The CLI validates the corpus before calling
an indexer and propagates its errors as a nonzero exit code. Custom indexers own their
backend's batching and replacement semantics.
