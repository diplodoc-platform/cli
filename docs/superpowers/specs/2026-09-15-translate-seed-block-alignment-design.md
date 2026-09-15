# Translate seed: block-level alignment of existing translations

## Problem

`yfm translate seed` pairs the units of a source file with the units of its
existing translation positionally, and only when both files split into the
same number of units. One merged or split sentence anywhere in the translation
shifts every later unit, so the whole file is reported as a mismatch and not
seeded at all. The next translate run that touches the file then sends every
unit to the model, and manual proofreading of the untouched sentences is lost.

Measured on the YTsaurus corpus (en -> ru, 1131 source files with an existing
translation): 708 files seeded, 389 mismatched, 34 failed to extract. Every
third file is retranslated from scratch on its next change.

The same rule also produces silent wrong pairs. When a sentence is merged and
another split in the same file the counts stay equal and every unit between
the two places is paired with its neighbour: 500 such pairs in 21 files of
the corpus. When two sections are ordered differently in the translation and
the counts happen to be equal, the units of one section are paired with the
units of the other.

The usual caller (the neurotranslate tasklet) seeds the trunk state of the
repository after the upstream change is merged. For a file touched by the
change the source already contains the new units while the translation does
not, so the counts diverge by exactly the size of the change, and the file is
retranslated on every change that adds or removes a sentence.

A third defect shows up once files align: the seed is a dictionary keyed by
unit text, last pair wins. Release notes repeat the same sentence in every
section, proofread differently in each; the dictionary hands every
occurrence the last wording, so lines whose source did not change appear in
the diff.

## Goals

1. Contain a divergence to the block where it happens. A block is a
   paragraph, a list item, a table row, a heading, a cut title: one line of
   the extract skeleton that carries placeholders. Units are paired inside a
   block; blocks are paired by their position in the document structure.
2. Recover the correspondence of blocks by language-independent anchors when
   the structure itself diverged (a section inserted, removed or moved):
   links, inline code, numbers.
3. Never produce a pair the anchors contradict. An unseeded unit costs one
   model request; a wrong pair puts a wrong sentence into the document.
4. Reproduce the existing translation of a file in place, including repeated
   sentences worded differently, so that a translate run changes only the
   lines whose source changed.
5. Report partially seeded files, with counts, so that callers can mark them
   in a review.

Non-goals: fuzzy text similarity, sentence-level alignment across blocks.

## Blocks

`parseBlocks(skeleton, units)` splits an extract skeleton into blocks.

Markdown skeleton (a string): every line that carries at least one
`%%%N%%%` placeholder is a block, in document order. Lines without
placeholders (blank lines, fences, `{% endcut %}`) are structure between
blocks and do not count.

A block has:

- `units`: the placeholder indexes of the line, in order.
- `signature`: the line with placeholders replaced by `%%%`, emphasis and
  code markers (`*`, `_`, `` ` ``, `~`, `^`) removed, list markers unified
  (`*`/`+` bullets to `-`, any ordinal to `1.`), inner whitespace collapsed,
  trailing whitespace trimmed. Leading indentation is kept: it is list
  nesting. Markers are removed because the translation may hoist inline
  markup differently, which is not a structural difference; ordinals are
  unified because an inserted item renumbers every later one.
- `structure`: the signature with runs of placeholders collapsed to one
  (`%%% %%% %%%` becomes `%%%`), so a paragraph of three sentences and a
  paragraph of two share the structure but not the signature.
- `anchors`: the sorted union of the anchors of its units (see below).
- `key`: signature plus anchors. Two blocks with equal keys are the same
  structural element with the same language-independent content.

YAML skeleton (an object): the object is walked depth-first; every string leaf
that carries placeholders is a block. Its signature is the property path with
array indexes dropped (`items[].name`), so that inserting an item does not
rename every later block. Scalar siblings of the leaf that carry no
placeholder (`href`, `id`, flags) join the block anchors: in a toc the
`href` is what identifies an entry, its `name` is translated.

## Anchors

`unitAnchors(unit)` returns the language-independent tokens of a unit as a
sorted list of tagged strings:

- `url:` link destinations, taken from the inline link tags of the unit and
  from bare URLs in its text;
- `code:` the text of inline code spans between `code_open`/`code_close`
  placeholders; an unpaired placeholder (the other marker was hoisted into
  the skeleton) extends the span to the unit edge;
- `num:` every number of the tag-stripped text; dotted numbers stay whole
  (`2.11.1`), other separators split, so a range or a date compares the same
  whatever dash the translation uses.

Anchors are compared as multisets, so `2.11.1` and `2.11.0` never pair.

## Alignment

`alignTranslationUnits(source, target, languages)` takes the units and
skeleton of both files and returns unit pairs plus counters. Blocks are
paired in four passes:

1. Longest common subsequence over the block keys. Anchored blocks act as pins
   (their keys are near unique), generic blocks are matched in order between
   the pins.
2. The run rule for generic pairs. A run is a maximal sequence of consecutive
   blocks with the same structure (a list, a group of paragraphs). A pair of
   unanchored blocks is kept only when the runs containing them have the same
   length and the blocks sit at the same offset. Otherwise the LCS had a free
   choice inside the run (an item was inserted or removed) and the pair is a
   guess: it is dropped. Anchored pairs are kept as matched.
3. Substitutions. In every gap between consecutive kept pairs, the unmatched
   source blocks and unmatched target blocks are paired positionally when
   their structure sequences are equal. These are blocks whose keys differ
   only in unit count or anchors: a paragraph with a merged sentence, an item
   with a localized link. Unit pairing inside them is validated separately.
4. Moves. Among the blocks still unmatched, anchored blocks with a key that
   is unique on both sides are paired. Every such pair is then extended
   forward and backward through unmatched blocks, run by run: the next runs
   on both sides are paired positionally when they share the structure and
   the length. A section moved as a whole is recovered entirely: its anchored
   lines pin it, its generic items follow.

Pairs from pass 4 are not monotonic; nothing downstream needs them to be.

## Unit pairing inside a block pair

Equal unit counts: units are paired positionally. Different counts (a
sentence merged or split by the translator): only units with anchors that
are unique inside the block on both sides are paired. The rest of the block
is left unseeded.

Every candidate pair passes `compatibleUnits`, otherwise it is dropped:

- the numbers of both units are equal as multisets;
- every code span and link of one unit occurs in the text of the other
  (a translator may put a parameter name into code the source left plain);
- the inline markup of the translation is consistent with the source
  (`keepsMarkup`): a unit whose code marker was hoisted into its own
  skeleton is not reused, because the source skeleton would restore a
  marker the unit still carries and the line would render broken.

Identity pairs that still contain source-script characters are skipped as
before (untranslated leftovers must not be frozen).

A kept pair is then classified by `doubtfulPair`: a word copied from the
other language's script (a Latin identifier inside Cyrillic text) missing on
the other side, or lengths differing more than three times over on a unit
longer than 40 characters. Such a pair usually means the translation
diverged at this place (a sentence merged with its neighbour, a stale
paragraph). It still reproduces what the file has, so it is kept for that
file, but it does not enter the shared dictionary. On the corpus 577 of
54754 pairs are doubtful.

## Seed store

The seed keeps two views of the pairs.

The dictionary maps a unit text to one translation, as before, but the most
frequent wording across the corpus wins instead of the last recorded one;
ties go to the first recorded, and files are recorded in their listed order,
so the dictionary is deterministic. Doubtful pairs stay out of it.

The per-file memory keeps the pairs of every file in document order (unit
hash and translation). `TranslationStore.resolve(file, units)` consults it
first: the units of the file being translated are matched to the recorded
sequence by longest common subsequence on unit hashes, and units outside the
subsequence (a section moved as a whole) take the unused entries of the same
text in order. Only then the dictionary and the run's own translations are
consulted. A sentence repeated in a file with different wordings keeps each
of them in place.

The seed file version is bumped to 2; files of the old version are ignored
and rebuilt by the next seeding run.

## Results and reporting

Per file the aligner reports `pairs` (with the doubtful flag), `skipped`
(identity leftovers), `unseeded` (source units without a pair) and block
counters. The seed command classifies files:

- aligned: every source unit is paired or skipped;
- partial: some units are unseeded, at least one is paired;
- mismatch: nothing paired although both files have units.

`seededFiles` and `seededUnits` count aligned and partial files together.
The stat line gains `partial-files`, `unseeded-units` and `doubtful-units`;
the existing counters keep their names and positions so that callers
parsing the line keep working:

```
PROCESSED en-ru seeded-files: 1067 seeded-units: 55151 skipped-units: 0 missing-targets: 34 mismatched: 30 failed: 34 partial-files: 465 unseeded-units: 9624 doubtful-units: 577
```

Per-file warnings, one line each, so that callers can mark the files:

```
WARN en/spyt.md Existing translation diverges in 13 of 270 units; they were not seeded.
WARN en/alien.md Existing translation does not align with the source; the file was not seeded.
```

## Acceptance

The release notes case from DOCSTOOLS-6779 (`yt/docs/*/_includes/releases/spyt.md`):
the source gained one section of 13 units and holds one section at a
different position than the translation. Seeding the changed source against
the existing translation pairs 254 of the 257 old units; a translate run over
the changed source reproduces every other line of the existing translation,
with the moved section at its new position, and sends to the model the 13
new units plus 3 old ones whose translation carries a code marker at a
different boundary than the source (reusing them would break the markup).
Whitespace follows the source skeleton, as it always did.

On the YTsaurus corpus the number of files with nothing seeded drops from
389 to 30, seeded units grow from 16975 to 55151, and the 500 shifted pairs
of the positional rule are gone.
