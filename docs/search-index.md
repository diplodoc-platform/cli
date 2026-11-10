# Search corpus export

Export resolved documentation as a backend-neutral JSON snapshot:

```sh
yfm build -i ./docs -o ./build --search-index
```

The build writes `_search/documents.json` in the output directory. `--search-index`
is an opt-in flag for HTML snapshot builds; watch mode is unsupported. Export works
independently of the browser search provider, including when search is disabled.
The CLI only prepares the JSON. Send it to your search backend with a separate script
or a step in your CI pipeline.

## JSON format

The top-level object contains `schemaVersion: 1` and a `documents` array. Each array
entry represents one page. For example:

```json
{
  "schemaVersion": 1,
  "documents": [
    {
      "id": "1f2fcdd0ccaac9f9a15f4a73a0d9c00fb787bac300f9959aeca48795d5bcc816",
      "path": "en/guide.md",
      "url": "en/guide.html",
      "lang": "en",
      "title": "Guide",
      "content": "Hello world & friends.",
      "headings": ["Guide"],
      "keywords": ["help"],
      "tags": ["guide"]
    }
  ]
}
```

All fields below are present. Scalar values are strings; `headings`, `keywords` and
`tags` are arrays of strings and may be empty.

| Field      | Meaning                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------ |
| `id`       | SHA-256 of the normalized source path, stable across content changes                       |
| `path`     | Source path relative to the documentation root, using forward slashes                      |
| `url`      | Published HTML link relative to the documentation root, respecting `--skip-html-extension` |
| `lang`     | Documentation language                                                                     |
| `title`    | Article title as plain text                                                                |
| `content`  | Resolved plain text without navigation, scripts or styles                                  |
| `headings` | Article title and section headings, without duplicates                                     |
| `keywords` | Resolved keywords                                                                          |
| `tags`     | Public tags, excluding names starting with `_`                                             |

TypeScript consumers can import `SearchCorpus` and `SearchDocument` from `@diplodoc/cli`.
Check `schemaVersion` before consuming a snapshot.

## Content and exclusions

The snapshot contains the content selected by the build's variables, conditions and
includes. Entries marked `noIndex` are excluded. Hidden entries follow
`search.hiddenPolicy` and the existing TOC inheritance rules. A leading page without
article HTML contributes its title and metadata description.

Documents are sorted by source path. Rebuilding with the same paths keeps their IDs;
moving a page changes its ID. Relative `url` values let the uploader choose the
publication base URL without tying the snapshot to a particular host.

Each successful export writes a complete snapshot. Removed or newly excluded pages
are absent, and no indexable pages produce an empty `documents` array. Export is
skipped if the build reports errors. A later HTML build without `--search-index`
removes a previously generated snapshot from the output directory.

## Send the snapshot with a separate script

Copy [upload-search-index.mjs](examples/upload-search-index.mjs) into your project.
The example uses Node.js to read the snapshot, check its version and POST the complete
JSON to an HTTP import endpoint. It exits with a nonzero code on an HTTP or network
error. Run it after a successful build:

```sh
yfm build -i ./docs -o ./build --search-index && \
  SEARCH_IMPORT_URL=https://search.example.com/import \
  SEARCH_IMPORT_AUTHORIZATION='Bearer <token>' \
  node ./upload-search-index.mjs ./build/_search/documents.json
```

`SEARCH_IMPORT_URL` and the optional `SEARCH_IMPORT_AUTHORIZATION` are read by the
example script, not by the CLI. Keep upload credentials in your CI secret storage.

The example assumes that the endpoint accepts this complete snapshot format. Adapt
the request, field mapping and batching to your backend's import API. Use `id` as the
stable document key and resolve `url` against your documentation's publication base.
For a shared search index, scope IDs by project and version to avoid collisions.

The uploader or import service owns replacement semantics: remove documents absent
from the new snapshot, including when `documents` is empty. It also owns retry policy,
authentication and backend-specific configuration. Merely adding the new documents
will leave deleted pages in search results.
