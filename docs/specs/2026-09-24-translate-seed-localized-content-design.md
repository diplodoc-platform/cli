# Keeping localized links, code blocks and heading ids of existing translations - design

**Date:** 2026-09-24
**Status:** implemented
**Package:** `@diplodoc/cli`

## Goal

A translate run after a source edit must change only what the edit changed. Today `yfm translate` composes the target file from the skeleton of the source and uses the existing translation as a dictionary of units (`yfm translate seed`). Everything outside the units comes from the source, and a unit the seed cannot pair is translated anew. Four kinds of translator work are lost this way, silently:

- **Localized links.** The link destination is part of the unit anchors the seed pairs units by (`unitAnchors` in `providers/ai/utils/align.ts`). A sentence whose translation links the article of the other edition of a wiki, or a channel `t.example/team_ru` instead of `t.example/team`, does not pair, goes to the model, and comes back with the source address and a new wording instead of the proofread one. Links to the same page with a language segment or another domain are paired by #2298 (DOCSTOOLS-6830), which this change builds on.
- **Text in code blocks.** A code block without a language (`Settings - Experiments - Plugin debugging`) is skeleton, so the output takes the source text.
- **Heading ids.** An id only the translation has (`## What next {#see-also}`) is lost; the heading block does not even pair, because the id is part of its signature, so the heading is retranslated too.
- **Links in the skeleton.** A list item that is a link as a whole (`* [Channel](https://t.example/team)`) carries only the link text as a unit; the destination is skeleton and comes from the source (`t.example/team_ru`), and the item does not pair either, because the destination is part of the signature.

Examples from translation PRs of the ytsaurus and Tracker documentation: an `en.wikipedia.org` link replaced with the `ru.wikipedia.org` one, `Настройки - Эксперименты - Отладка плагинов` in an English page, `// Reading` comments replaced with `// Чтение`.

## Non-goals

- **Model output.** A sentence that goes to the model is not rewritten after it. When the model keeps the source address of a link the translator localized, the run reports it (see "Report"), it does not replace it.
- **Links on the same host.** A translation linking another page of the same host (another commit, another section) is taken for an outdated translation, not a localized one.
- **Code of same-script pairs.** For languages written in the same script a translated code line cannot be told from changed code; no code block is kept.
- **YAML documents.** Their skeleton carries no code blocks or heading ids.

## Design

### 1. Links: two more ways to the same page (seed)

On top of `linkRelation` of #2298:

- a language suffix of a name in the path is dropped with the language segments: `t.example/team_ru` and `t.example/team`, `mailto:team-ru@example.com`, `screen-en.png`;
- a new relation `edition`: two absolute links whose hosts differ by a leading language label only (`en.example.org` and `ru.example.org`), with paths equal but for the last segment - the article of the other language edition of a wiki, whose title is translated. It is treated like `nested`: the pair is seeded for its file, marked doubtful and kept out of the shared dictionary.

Link destinations written in the skeleton (a list item that is a link as a whole: `* [%%%0%%%](https://t.example/team_ru)`) are part of the block signature. They are compared by `linkPath`: the host without a leading language label, the path without the language parts (`pathSegments`), query and section; a destination that is a variable as a whole stays as is. Unlike `linkRelation` the host counts: the list item has no text of its own to confirm the pair, and `t.example/team_ru` must not pair with `social.example/team`.

A seeded unit carries the addresses of the translation: compose takes the link destination from the unit (`equiv-text`), so a paired sentence keeps its localized link without further work.

### 2. Heading ids are anchors, not structure (seed)

Ids at the end of a markdown skeleton line (`{#id}`, spaces allowed) leave the block signature and structure and become block anchors `id:<name>`. Equal ids still pin the alignment; a heading with an extra id has the same structure and pairs positionally in a gap. Two blocks that both have ids and none in common are different headings and never pair positionally (`sameElement`): without that rule a glossary sorted by the letters of each language paired `## Л {#rus-l}` with `## D {#d}`. `{#T}` elsewhere on a line is the text of an autotitled link and is left alone.

### 3. Skeleton fragments (seed -> translate)

The seed records per file the pieces of the translation that live in the skeleton and that the translator localized (`SkeletonFragment` in `providers/ai/utils/skeleton.ts`, stored in the seed file under `skeletons`):

- **Code blocks.** A fenced code block pairs with the translation's block by position: the index of the aligned text block above it and the count of code blocks after that block, and the text blocks after them have to agree (aligned with each other, or both without a pair), so that a translation that merged two steps does not give the first step the code of the second. The pair is kept when it is a localization: identical fence lines, equal line and placeholder counts, and every changed line either contains source-script characters or brings target-script characters (`untranslatedMarker` in both directions).
- **Lines.** For an aligned block outside code, ids the translation has and the source does not are appended after the source ids, and the link destinations of the skeleton line take the ones of the translation when they have the same `linkPath` in the same order.

A fragment is keyed by the source piece with its placeholders numbered from 0 in order (a literal `%%%` of code stays as it is; for a line, together with the texts of its units) and its occurrence among equal pieces of the file. The translate run, before compose, puts every fragment back where the new source skeleton has the same piece at the same occurrence, giving its placeholders the numbers of that piece. A copy of a localized code block the source added after the recorded ones takes the localization of the last of them; a line is not copied, so that its heading ids stay unique (a heading inserted above with the same text takes the ids of the old one: a known limit). In the neurotranslate flow the seed is built from trunk, where source and translation are in sync, and the translate run sees the source of the PR, so "the same piece" means "not changed by the PR".

The seed file version stays 3: a seed without `skeletons` restores nothing, and every seeding run rebuilds the file.

### 4. Report

The translate run warns per file (a `WARN <path> ...` line, which the neurotranslate cube turns into a separate line of the translation PR report):

- fragments of the file that were not put back because the source changed the piece: `Existing translation localized 1 code block and heading ids or link addresses in 1 line the source has changed since; the output takes them from the source.`
- links the file's seeded pairs localized (`localizedUrls` over the file memory) that the output links with the source address again: `Existing translation localized 1 link the output takes from the source again, e.g. <source address> instead of <localized address>.`

Counters: `skeleton-fragments: N` in the seed stat line, `restored-fragments: N` in the translate stat line.

## Measurements

Trunk of 2026-09-24, `yt/docs` (both directions) and `docs/support/tracker/common` (ru -> en), markdown and yaml files only, no vars. `yfm translate seed` from trunk, then `yfm translate --dry-run` over the unchanged source with that seed. A dry run returns the source text for every unit the seed does not cover, so the output reproduces the existing translation exactly where nothing is lost; "changed lines" are the lines of the existing translation the run would change. "Before" is #2298 (with `@diplodoc/translation` 1.9.1), "after" is this change on top of it.

|                          | seeded units | skeleton fragments | changed lines | of them in code | files reproduced as is |
| ------------------------ | ------------ | ------------------ | ------------- | --------------- | ---------------------- |
| YT ru -> en, before      | 57615        | -                  | 11040         | 2071            | 434 of 1126            |
| YT ru -> en, after       | 57703        | 100                | 10834         | 1886            | 436                    |
| YT en -> ru, before      | 57698        | -                  | 16952         | 4288            | 467 of 1124            |
| YT en -> ru, after       | 57788        | 112                | 16734         | 4103            | 469                    |
| Tracker ru -> en, before | 31332        | -                  | 10665         | 1603            | 58 of 720              |
| Tracker ru -> en, after  | 31515        | 160                | 10427         | 1340            | 61                     |

Most of the remaining changed lines are translations that diverged from the source (sections only one language has, merged sentences, reordered pages), which neither version can reuse. The upper bounds of the ticket count those too, and `[{#T}](...)` autotitles as heading ids.

YT has no line the change loses against #2298. On the Tracker the only such lines are in two files whose English page is another document altogether (`quick-start/glossary.md` sorted by English terms, `user/default-filters.md`), where any alignment is noise.

Examples from the ticket on this corpus: `Settings - Experiments - Plugin debugging` in `tracker/en/plugins/tools/cli.md` is kept (was `Настройки - Эксперименты - Отладка плагинов`), the sentence with the `en.wikipedia.org` link in `yt/en/_includes/user-guide/storage/data-types.md` is seeded (was sent to the model), the Telegram and mailing list items of `yt/en/index.md` keep their English addresses.
