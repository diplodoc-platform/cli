# Translate seed: reusing existing translations

`yfm translate seed` reads the existing translations of a project and turns
them into a translation memory that `yfm translate` consults before the
model. A following translate run then reuses the existing wording of every
unchanged sentence and sends only new or changed sentences to the model,
so manual edits in the translated files survive retranslation.

```
yfm translate seed -i ./docs --source ru --target en --cache-dir ./.translate-cache
yfm translate -i ./docs -o ./docs --source ru --target en --cache-dir ./.translate-cache ...
```

The seed lives in `<cache-dir>/seed.<source>-<target>.json`. It carries no
model or prompt fingerprint: it reflects the state of the files, not a model
output, and survives model, prompt and glossary changes. Every seeding run
rebuilds the file from scratch.

## How files are aligned

For every source file with an existing translation both files are split
into translation units (sentences, headings, list items, table cells) the
same way the translate run does, and the units are paired.

Pairing works block by block. A block is a paragraph, a list item, a table
row, a heading, a cut title: one line of the extract skeleton carrying units
(for yaml files, one translated property). Blocks of the two files are
aligned by their structure and by language-independent anchors of their
text: links, inline code and numbers. Inside an aligned block pair units are
paired positionally.

A divergence stays inside its block. When a translator merged two sentences
of a paragraph into one, that paragraph is left out and the rest of the file
is still seeded. A section that only exists in the source (an upstream
change not translated yet) is left out; a section that moved is found again
by its anchors.

A pair is kept only when the two units can be translations of each other:
same numbers, every code span and link of one present in the other, and
inline markup consistent between them. An unseeded unit costs one model
request, a wrong pair puts a wrong sentence into the document.

Identity pairs that still contain source-script characters are untranslated
leftovers and are not seeded, so the next run gets another chance at them.

## Repeated sentences

The seed keeps two views of the pairs. The dictionary maps a sentence to its
most common translation across the project: a sentence new to a file gets
the wording the project already uses. The per-file memory keeps the pairs of
every file in document order: when a file is translated again, its units are
matched to that sequence first, so a sentence repeated in the file with
different wordings keeps each of them in place.

A pair the anchors accept but the text makes unlikely (a product name or an
identifier copied into the translation that the source does not contain,
lengths differing several times over) is doubtful: it usually means the
translation diverged from the source at this place. Such a pair still
reproduces what the file has, so it stays in the per-file memory, but it
does not enter the dictionary.

## Output

The stat line counts files and units:

```
PROCESSED ru-en seeded-files: 1090 seeded-units: 24500 skipped-units: 12 missing-targets: 34 mismatched: 3 failed: 34 partial-files: 140 unseeded-units: 900 doubtful-units: 25
```

- `seeded-files`, `seeded-units`: files and units that produced pairs, partially seeded files included;
- `skipped-units`: identity pairs left for the model;
- `missing-targets`: source files without a translation;
- `partial-files`, `unseeded-units`: files whose translation aligned in part, and their units left without a pair;
- `mismatched`: files whose translation did not align at all;
- `failed`: files whose source or translation could not be read or extracted;
- `doubtful-units`: pairs kept for their file only, out of the dictionary.

Files that were not seeded in full are reported one per line on stderr, so
that a caller can mark them in a review:

```
WARN ru/releases.md Existing translation diverges in 13 of 270 units; they were not seeded.
WARN ru/alien.md Existing translation does not align with the source; the file was not seeded.
WARN ru/broken.md Failed to seed the file: ...
```

## Limits

The output of a translate run follows the skeleton of the source file:
blank lines, trailing whitespace and the placement of inline markup markers
come from the source, not from the existing translation. A translation that
carries markup differently at a unit boundary (a code marker hoisted into
its own skeleton) is not reused for that unit.
