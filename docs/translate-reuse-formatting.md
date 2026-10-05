# Formatting of reused translations

The AI providers accept `--reuse-formatting target|source` independently of
seeding, model, prompt and glossary settings. The default is `target`.

```sh
yfm translate seed -i ./docs --source ru --target en --cache-dir ./.translate-cache
yfm translate -i ./docs -o ./translated --source ru --target en \
    --provider openai --reuse-formatting source --cache-dir ./.translate-cache
```

The equivalent `.yfm` setting is:

```yaml
translate:
  reuseFormatting: source
```

`target` preserves the existing reuse behavior. An exact copied Markdown
source keeps its approved translation byte for byte, including its original
formatting. Existing files keep their per-unit translation memory.

`source` retains approved wording and composes it with the source's Markdown
formatting: headings, list markers, indentation, blank lines and parsed inline
emphasis. It applies both to exact copies and to seeded units reused inside
an edited file. New or changed prose follows the normal model translation path.
Localized link destinations, translated link titles, added heading anchors and
safely localized fenced examples remain resources of the approved translation.
Code identifiers, variables and literal examples are protected.

For example, with source `1. Первое действие.` and approved target
`2. **Approved first action.**`, `source` produces `1. Approved first action.`.
The wording is reused without a model request.

The seed stores both extracted Markdown sides. Existing seed files remain
compatible with `target`; run `translate seed` with the updated CLI before
selecting `source`. The seed still has no model, prompt or glossary fingerprint.
Generated AI cache entries for `source` use a separate fingerprint, so cached
formatting from `target` cannot bypass the policy.

## Explicit refusal

`source` requires complete safe alignment of the seeded document. Merged or
unmatched sentences, ambiguous approved copies, incompatible placeholders,
changed code literals or unsupported inline structures fail the file with
`REUSE_FORMATTING_UNSAFE` in the translation report. The CLI does not write
that file or send its approved text to the model as a fallback.

A whole-unit style has a known translated boundary. An interior source style
with no matching translated span is refused, since its translated boundary
cannot be inferred safely. Indented code blocks are currently unsupported and
also refused. This policy can therefore reject an older translation that
`target` can reuse unchanged.

The option changes reuse of Markdown seeds. It does not edit the source or
approved translation files during seeding and does not enable seeding itself.
