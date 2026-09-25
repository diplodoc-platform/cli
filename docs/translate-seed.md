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

A link is present when the other side has a link to the same page, not a
word of its text: the same query and section, and the same path once the
domain and the language segments (`/en/`, `en.` in the host) are dropped.
A variable in the path (`{{source-root}}/src/main.cpp`, `{{ domain }}` with
spaces too) matches the literal segments around it, `.` and `..` resolved.
A language variable (a name with the word `lang`, `language`, `locale` or
`lng`: `{{lang}}`, `{{ui-lang}}`) stands for a language segment or for none
(`/docs/{{lang}}/` for `/docs/ru/` and `/docs/`). A variable in a segment
stands for one segment around its literal parts (`v{{version}}` for `v2`).
Any other variable stands for at least one segment, `..` only at the start
of the path: `/docs/{{section}}/install.md` is not `/docs/install.md`. A
variable in the page (`/docs/{{page}}`, `/docs/{{page}}.md`) or for the
whole address says nothing about the page, unless it is a language
(`graph-{{lang}}.png`). Another domain
counts only when it differs in the top-level domain alone (`example.com`
and `example.org`, not `console.example.com` and `example.com`, not
`github.com` and `gitlab.com`); ports and addresses have to match. The source path may
have a section more than the translation only on another site, which lays
its pages out differently (`example.com/.../v5/changes/check.html` for
`example.org/.../changes/check.html`): such a pair is seeded for its file
but marked doubtful. On the same site, and whenever the translation has a
section the source lacks, it is another page, for example a link the
source has just fixed, and the unit is not seeded.

A language suffix of a name in the path is dropped with the language
segments (`t.example/channel_ru` for `t.example/channel`,
`team-ru@example.com`). A page of the other language edition of a site at
the same place of the path (`ru.example.org/wiki/Календарь` for
`en.example.org/wiki/Calendar`, a wiki whose titles are translated) is
seeded for its file and marked doubtful, as a section more on another site.

Heading ids (`{#id}` at the end of a line) are not part of the structure: a
heading with an id the translator added is still the same heading. Two
headings that both have ids and none in common are different headings.

Blocks are aligned by their links first as they are (paths without the
domain and the language segments), then, in the gaps left, by the pages
the links lead to when every link of one block leads to the page of a
link of the other, or of another site laid out differently. Pages of the
same name in different sections of one site (`compute/index.md`,
`docs/index.md`) never pin a block pair.

A code span pairs with a code span of the same text on the other side,
however many times each side repeats it. One left without a pair may be
a word of its own in the plain text of the other side, an identifier of
several words with any separators ("row cache" for `row_cache`), but only
while the other side has no code of its own left: a changed identifier is
not confirmed by plain text around it. A longer word, identifier or path
does not count (`id` is not in "uuid", `config` is not in "config.yaml").
Case may differ only for a word of one case longer than two characters
("JSON" for `json`), not for a flag (`-f`) or a name in mixed case
(`getUser`); a code of one character or without letters is never
confirmed by text.

Identity pairs that still contain source-script characters are untranslated
leftovers and are not seeded, so the next run gets another chance at them.

## Localized code blocks, heading ids and link lines

A translate run composes the output from the skeleton of the source file,
so whatever lives in the skeleton rather than in the units comes from the
source: the text of a code block without a language, a heading id only the
translation has, the destination of a link that makes up a list item as a
whole (`* [Channel](https://t.example/channel)`: the unit is the link text).
The seed keeps such pieces of the existing translation per file and the
translate run puts them back:

- a fenced code block is kept when the translation changed only text in
  it: same fence lines and line count, and in every changed line the text
  in the source script (or, from a source written in Latin, the text in
  the target script) is replaced and the code around it stays as it is.
  The text of a comment is free, the code before it stays
  (`yt list //home # Список` for `yt list //home # List`); the markers are
  those of the block language (`#` in a shell or Python, `--` and `#` in
  SQL, `#` and `//` elsewhere, a line of `/*` up to its end, `%` or `;`
  too); a changed `#` or `%` line of a shell or a block without a
  language is not localized: either side may be a prompt (`# Привет` and
  `# reboot` cannot be told apart). Outside comments the whole
  text of a string of text, prose with no fewer words of the script than
  others, is replaced by prose that keeps its words in other scripts
  (`"Id владельца"` for `"Owner ID"`, not `"SELECT Имя FROM Сотрудники"`
  for `"DROP TABLE users"`), other text by
  words with the spaces and punctuation it has, a line of text alone by
  any number of words: `echo "Привет"` is not localized as `rm -rf /`,
  `echo "$(date)"` or `printf "Hello"`, `git commit -m Исправление` not as
  `git commit -m Fix --amend`. A block whose command changed is outdated
  rather than localized and follows the source. Code blocks pair by
  position: the one that follows the same aligned text block, counted from
  it, and is followed by text blocks that agree (aligned with each other,
  or both without a pair). Languages written in the same script keep no
  code blocks: a translated line cannot be told from changed code.
- heading ids the translation added to an aligned line are kept after the
  ids of the source;
- a link destination of an aligned line takes the one of the translation
  when it leads to the same page on the same site: the host without a
  language label and the path without the language parts are the same
  (`t.example/channel_ru` for `t.example/channel`).

A piece is put back only where the source still has it as the seed saw it:
the same code block text, the same line with the same text, at the same
occurrence in the file. A copy of a localized code block that the source
added takes the same localization; a line is not copied, so that heading ids
stay unique. Comments inside code are units (`--code adaptive`, the default
of the LLM providers) and are seeded like any other sentence.

What the output takes from the source although the existing translation had
localized it is reported per file, so that a reviewer sees it:

```
WARN ru/page.md Existing translation localized 1 code block and heading ids or link addresses in 1 line the source has changed since; the output takes them from the source.
WARN ru/page.md Existing translation localized 1 link the output takes from the source again, e.g. https://ru.example.org/wiki/... instead of https://en.example.org/wiki/....
```

The second line appears when a sentence with a localized link went to the
model and the output has the address of the source; the localized addresses
of a file are taken from its seeded pairs.

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
PROCESSED ru-en seeded-files: 1090 seeded-units: 24500 skipped-units: 12 missing-targets: 34 mismatched: 3 failed: 34 partial-files: 140 unseeded-units: 900 doubtful-units: 25 skeleton-fragments: 160
```

- `seeded-files`, `seeded-units`: files and units that produced pairs, partially seeded files included;
- `skipped-units`: identity pairs left for the model;
- `missing-targets`: source files without a translation;
- `partial-files`, `unseeded-units`: files whose translation aligned in part, and their units left without a pair;
- `mismatched`: files whose translation did not align at all;
- `failed`: files whose source or translation could not be read or extracted;
- `doubtful-units`: pairs kept for their file only, out of the dictionary;
- `skeleton-fragments`: localized code blocks and lines kept for the translate run.

The translate stat line reports the fragments it put back as `restored-fragments: N`.

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
come from the source, not from the existing translation; only the code
blocks and lines described above are taken from the translation. A marker the
translation lost to its own skeleton (a code span or emphasis ending right
at a unit boundary) is put back into the seeded unit, so a translator's
code span at the edge of a sentence survives. The reverse does not compose:
when the source hoists a marker the translation keeps inside the unit, the
unit is not reused and goes to the model.
