# Update a translation from a source change

Use `yfm translate --update-manifest` to apply one source change to an existing localized file. The caller supplies the source snapshots and the existing translation. The CLI identifies the changed content and uses the configured translation provider for the text that needs translation.

For example, save this JSON as `update.json`. The heading anchor identifies where the new paragraph belongs in the French page.

```json
{
  "version": 1,
  "kind": "markdown",
  "file": "guide/start.md",
  "before": "# Start {#start}\n",
  "after": "# Start {#start}\n\nRead the guide.\n",
  "target": "# Premiers pas {#start}\n"
}
```

```sh
yfm translate -i ./docs -o ./translated --provider openai \
    --source en --target fr --update-manifest ./update.json \
    --report ./report.json
```

The example sends the new paragraph to the provider and writes `translated/fr/guide/start.md`. The heading keeps its approved French wording. Use the usual provider credentials and translation settings.

| Kind       | Snapshot contents                                                                                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `markdown` | The previous and proposed source texts and the existing localized Markdown. Use `null` for both `before` and `target` for a new page.                                                                                                                                                                              |
| `toc`      | The same three texts for a `toc.yaml`. Existing navigation entries anchor insertions.                                                                                                                                                                                                                              |
| `openapi`  | `file` names a YAML root. `before`, `after` and `current` are objects mapping relative paths to YAML contents, including the local references needed to resolve the change. `current` is the source tree used to check that the change still applies. `target` is the text of the existing bundled localized root. |

Run one manifest for one target language. The relative paths use forward slashes. Keep a copy of the translation used to construct the manifest until the update completes. When writing to an existing output, the CLI checks its contents against the supplied target.

A structural edit can finish with zero translation requests. If the CLI cannot locate a change unambiguously, or the provider returns an incomplete translation, the command fails and preserves the target. After a successful run the JSON report includes `update.version` and `update.file`. A caller collecting several outputs can check this marker and validate the complete set before publishing it.
