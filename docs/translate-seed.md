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

The seed is keyed by unit texts, so the options that shape the units must
match between the two commands: `--source`, `--target`, `--vars`, `--presets`, `--vars-preset` and `--code`.
The seed takes `code` from the `translate` section of the config (or from its
own `translate.seed` section) and otherwise defaults to `adaptive`, the mode
of the LLM providers. A project that translates with the yandex provider,
where the default is `precise`, or passes `--code` on the command line has to
pass the same value to the seed.

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

A link is present when the other side has a link to the same page: the
same page, query and section, and the same path once domains, language
segments and a variable for the start of the path (`{{source-root}}`) are
dropped. A path with an extra section is the same page only on another site,
which may lay its pages out differently (`example.com/.../v5/changes/check.html`
for `example.org/.../changes/check.html`): such a pair is seeded for its file
but marked doubtful. On the same site, relative links included, an extra
section is another page (`/en/docs/install.md` for `/ru/docs/admin/install.md`),
for example a link the source has just fixed, and the pair is not seeded.

A code span pairs with a code span of the same text on the other side. One
left without a pair may be words the other side leaves plain, verbatim or
with other separators (`row_cache` for "row cache"), but only while the
other side has no code of its own left: a changed identifier is not
confirmed by plain text around it.

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

## Changed sentences

A unit the seed does not cover is sent to the model. When the file memory
still holds a close previous version of it (the sentence was edited, not
written anew), the request carries that previous source, its existing
translation and the word-level changes between the two versions, with the
instruction to apply exactly these changes to the existing translation. The
model then changes what the edit changed and keeps the rest of the wording,
so the translated page gets a diff of the same size as the source page, and
terminology does not drift between edits.

The previous version is the unused entry of the file memory whose words
overlap the unit the most (Dice coefficient over the word bags), and at
least by 0.6; every entry is used once, in document order. A unit without
such an entry is translated as before. A new seeding run is required for
the memory to know the versions the files had before the edit, which is
what the seed flow does anyway.

The translate stat line reports the units sent with a previous version as
`memory-hints: N`, and the run report as `cache.hints`. `--no-memory-hints`
(config: `memoryHints: false`) turns the feature off for a run.
The memory of a unit counts towards `--max-batch-tokens` together with
the unit, so batches with many edited units hold fewer units.

Measured on ru->en point edits of the Tracker documentation
(`docs/specs/2026-09-22-translate-memory-hints-design.md`): the median
number of words changed in the translation beyond the source edit went from
9 to 0, the judge's consistency score from 74 to 99, at about 2% more
tokens per request.

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
come from the source, not from the existing translation. A marker the
translation lost to its own skeleton (a code span or emphasis ending right
at a unit boundary) is put back into the seeded unit, so a translator's
code span at the edge of a sentence survives. The reverse does not compose:
when the source hoists a marker the translation keeps inside the unit, the
unit is not reused and goes to the model.
