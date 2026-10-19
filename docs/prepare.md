# `yfm prepare` reference

Collect the original files needed by the selected documentation build into a portable
source artifact. `yfm prepare` accepts the input, configuration, and build options
of `yfm build`. It runs native processing against a read-through temporary input,
then validates a packed candidate with the same selected processing. The artifact
contains original sources, not the rendered site or generated intermediate files.

```bash
yfm prepare -i ./docs -o ./prepared -f html --vars-preset public --dry-run
yfm prepare -i ./docs -o ./prepared -f html --vars-preset public
yfm build -i ./prepared -o ./site -f html --vars-preset public
```

The output directory must be new and must not overlap the input. `--dry-run`
runs discovery and relocation validation without creating the artifact. Failed
preparation removes temporary files and leaves no artifact. Preparation uses one
worker and disables watching and in-place input processing.

Preparation does not start by copying the input tree. Reads resolve original
files on demand, while generated files stay in the temporary workspace. Native
TOC processing selects pages through conditions, presets, link and merge modes,
and generic or OpenAPI includers. Ancestor presets load before their native
variable scopes are created, using the original pre-merge preset layout. TOC
discovery retains the selected native ignore rules; it is not root-only by default.

Markdown and code includes, native assets, custom resources, and observed local
extension dependencies are collected with their original provenance. Existence
and size decisions also count as dependencies. Merge copies alone do not select
unused files. In particular, prepare omits unrelated HTML passthrough files and
unused `_assets` contents that the ordinary HTML build copies wholesale.

For HTML output, the collector parses native rendered fragments after the selected
HTML and sanitization rules. It follows `src` on iframe, img, video, audio, source,
track, script, and embed elements, `video poster`, and `object data`. It also follows
`link href` for stylesheets, icons, preload, and modulepreload declarations. Selected
local `.html` and `.htm` documents embedded through iframe, object, or embed elements
are parsed for the same declarations. Cycles are visited once. URL queries and
fragments are removed, and HTML entities and URL-encoded filenames are decoded. Root-relative URLs
resolve under the input directory. Local URLs escaping that directory fail
preparation. Remote URLs remain unchanged and are not downloaded. The collector
does not inspect JavaScript or CSS for additional runtime requests. Nonempty
`srcset` and `imagesrcset` declarations fail explicitly instead of producing a
partial artifact. Native plain leading-page HTML title and description fields are
also inspected; link labels remain text, as in the native client.

Native filesystem reads by local extensions are observed. Entries returned by
supported directory APIs count as inputs. The staged view follows native file
copying: source symlinks appear dereferenced, and directories containing no eligible
copied files are absent. A positively observed staged directory retains one file
witness only when selected descendants do not already recreate it. Generated work
files and directories keep their native identity. Reads of original configuration
paths retain original symlinks and empty directories. Native glob traversal records
matched paths without selecting every visited file.
The read-through adapter supports staged `readdir`, file reads, metadata checks,
`realpath`, `open`, and read streams. Staged `opendir`, `opendirSync`, promise-based
`opendir`, and recursive `readdir` fail explicitly; use a scoped glob or supported
`readdir` instead. Preparation rejects these unsupported reads even when an
extension catches their errors. Directory APIs accessing original configuration
paths keep their native behavior.

Source bytes and relative paths are preserved without TOC or Markdown rewriting.
File modes and modification times are retained, including for `--mtimes` builds.
Observed relative symbolic links retain their link nodes and required target
layout; only selected target files are collected. Absolute link targets and
unresolved dangling or cyclic links fail with a relocation diagnostic. Filesystem
identity such as inode numbers and creation or change times is not preserved.

If a config or local extension is outside `-i`, the artifact preserves its layout
under the common source ancestor. The command prints relocated input, config, and
CLI extension paths. For example:

```bash
yfm prepare -i ./project/docs -c ./project/settings/docs.yaml -o ./prepared
# If project/settings is required, use the printed paths:
yfm build -i ./prepared/docs -c ./prepared/settings/docs.yaml -o ./site
```

Reuse the selected build options, presets, and environment when building the
artifact. Command-line overrides are not baked into configuration. A collection
for one format or condition selection does not promise inputs for other selections.
The CLI, extensions, and remote resources must remain compatible. Hardcoded
original paths detected by candidate validation fail with a relocation diagnostic.

The filesystem adapter is bounded to the supported native APIs. Observed mutation
APIs reject extension writes outside the temporary workspace, including during
configuration initialization. Subprocesses, native addons, other unobserved APIs,
and nondeterministic extensions need their own portability contract. Ordinary
`yfm build` behavior is unchanged.
