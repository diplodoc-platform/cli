# Translation eval corpus

Reference corpus for the AI translation eval harness
(`npm run translate:eval`, see [docs/translate-eval.md](../../docs/translate-eval.md)).

## Layout

- `corpus/ru/` - source pages (russian), including `toc.yaml` and `_includes/`.
- `corpus/en/` - reference translations, unit-aligned with the sources.
- `corpus/glossary.yaml` - required term translations, passed to
  `yfm translate --glossary` and verified by the deterministic checks.

## Content

The pages are taken from the real Diplodoc documentation
([diplodoc-platform/docs](https://github.com/diplodoc-platform/docs), MIT),
which maintains line-aligned ru/en page pairs. The set is chosen to cover
the constructs a translation must preserve:

| Page                         | Covers                                  |
| ---------------------------- | --------------------------------------- |
| `about.md`                   | plain prose                             |
| `quickstart.md`              | tabs, notes, includes, liquid variables |
| `syntax/notes.md`            | notes, includes                         |
| `syntax/code.md`             | code fences, inline code                |
| `syntax/term.md`             | term definitions, popups includes       |
| `syntax/vars.md`             | liquid variables, `not_var` escaping    |
| `syntax/links.md`            | links, anchors                          |
| `syntax/lists.md`            | lists                                   |
| `syntax/tables/gfm.md`       | markdown pipe tables                    |
| `syntax/tables/multiline.md` | YFM grid tables, tables with code       |
| `project/minitoc.md`         | tabs, images                            |
| `extensions/index.md`        | tables with links, notes                |

## Editing rules

- Both language versions of a page must split into the same number of
  translation units (sentences): the mock provider pairs them
  positionally, and a mismatched file drops out of the mock translation
  memory. After editing corpus pages, run the harness - it reports
  mismatched files and translation memory misses, and keeps the
  captured unit lists of both sides in `<workdir>/units.json` for
  side-by-side comparison.
- Deduplication couples files: a unit repeated across files (e.g. a
  `toc.yaml` name equal to a page H1) is extracted only once per run,
  so repeats must be mirrored in both languages. In particular, `en/toc.yaml`
  names must match the en page titles exactly where the ru names match
  the ru titles.
- Do not add a live `{% file %}` directive: its translate round-trip is
  lossy upstream (compose mangles the directive), which would keep the
  markup gate permanently red. A fenced example is fine.

Deviations of the corpus from the upstream docs pages: the en toc name
for `quickstart.md` follows the page H1 (`Quick start`), the mangled
`{% file %}` line in `en/syntax/links.md` was repaired, and the live
`{% file %}` directive was removed from `syntax/links.md` in both
languages (see above).
