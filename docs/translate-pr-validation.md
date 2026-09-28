# Validate a translation PR on consumer documentation

Use this recipe to compare two CLI revisions on the same documentation, with
both fresh translation and translation memory seeded from an existing locale.
Keep the validator fixed while changing the CLI under test. A deterministic
fixture suite and live model runs answer different questions; run both.

## Prepare the binaries and artifacts

Use Node.js 24 or newer and npm 11.5.1 or newer. Build the baseline and candidate
in separate, clean checkouts with `npm ci && npm run build`. Record the commit
and lockfile hash for each. Keep the whole checkout, including `lib`, `build`,
`package.json` and dependencies: copying only `build/index.js` is insufficient.
Do not rebuild either checkout during a comparison.

Run the eval commands below from a third, fixed validator checkout, or from the
candidate checkout without modifying it during the series. The validator needs
the independent Markdown inventory checker introduced by
[PR #2308](https://github.com/diplodoc-platform/cli/pull/2308); older validators
do not detect all added inline formatting. Build the validator too, since the
eval launcher checks for its local CLI build even when `--cli` is supplied.

```sh
export BASELINE_CLI=/absolute/path/to/baseline/build/index.js
export CANDIDATE_CLI=/absolute/path/to/candidate/build/index.js
export VALIDATION_ROOT="$(mktemp -d)"
export CORPUS_BEFORE="$VALIDATION_ROOT/before"
export CORPUS_AFTER="$VALIDATION_ROOT/after"
```

Keep credentials outside these directories. Use the provider's token file or
environment-variable mechanism, never a token literal in committed commands or
reports. Verify that sending the chosen documents to that provider is allowed.

## Choose a corpus

Use at least three representative pages per consumer and preserve the same
snapshot for both revisions. Include lists, existing emphasis, links, code,
tables and YFM blocks. Confirm that a consumer actually uses the translation
tasklet from its build configuration; a Diplodoc website alone is not proof.
Record that check privately when the configuration is internal.

Tracker, Forms, Wiki and Games are useful consumer examples. Public Markdown
exports can be obtained from these official URLs by substituting `ru` or `en`
for `{lang}`:

| Consumer | URL prefix                                  | Page paths (append `.md`)                                                 |
| -------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| Tracker  | `https://yandex.ru/support/tracker/{lang}/` | `user/create-ticket`, `user/edit-ticket`, `user/notification-constructor` |
| Forms    | `https://yandex.ru/support/forms/{lang}/`   | `new-form`, `add-questions`, `send-request`                               |
| Wiki     | `https://yandex.ru/support/wiki/{lang}/`    | `create-page`, `wysiwyg/text-format`, `wysiwyg/tables-format`             |
| Games    | `https://yandex.ru/dev/games/doc/{lang}/`   | `sdk/sdk-server-time`, `sdk/sdk-review`, `sdk/sdk-player`                 |

Save raw responses before preprocessing. Verify the HTTP status and that the
response is Markdown, not an HTML error page. Record the URL, download time and
SHA-256 of both the raw response and the processed article. Published pages can
change: matching URLs alone do not reproduce a historical comparison.

For exported Markdown, remove only generated frontmatter and the initial
`Documentation Index` banner if they are present. Keep article markup unchanged.
Document every preprocessing step. Exported Markdown is not the original source:
it may contain rendering artifacts or already-expanded includes. Reject a broken
export before selecting the corpus, or retain and report its limitations for
both revisions; never silently clean only the candidate's input.

Arrange the corpus as follows (filenames must match across locales):

```text
before/
  glossary.yaml
  ru/toc.yaml
  ru/tracker/create-ticket.md
  ru/forms/new-form.md
  ...
  en/toc.yaml
  en/tracker/create-ticket.md
  en/forms/new-form.md
  ...
```

Use `[]` in `glossary.yaml` if there is no approved glossary. Each `toc.yaml`
must list the selected pages with relative `href` values. Include required
assets and includes when testing original source trees. In real-model mode the
existing English locale is a reference, not a byte-exact expected translation.
Public locales can differ in content and structure; record these differences
when interpreting seeded runs.

Copy `before` to `after`, then edit one ordinary prose sentence in each Russian
page. Leave English and all unrelated markup unchanged. Save a unified diff of
the edits. For example, prefix a sentence with `Важное уточнение: `. This is a
controlled edit on real documentation, not a replay of a production PR. For a
historical replay, use the actual before/after snapshots and preserve their IDs.

## Use a wrapper for isolated caches and run reports

The eval CLI accepts `--cli` but does not forward arbitrary translation flags.
Save this as `$VALIDATION_ROOT/cli-wrapper.mjs`. It uses the same translation
budgets for both revisions, seeds a fresh per-run cache in incremental mode,
and writes a provider report next to each eval output.

```js
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';

const {VALIDATION_CLI: cli, VALIDATION_MODE: mode, CORPUS_BEFORE: before} = process.env;
if (!cli || !['full', 'seed'].includes(mode)) throw new Error('Set CLI and mode');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
if (outputIndex < 0 || !args[outputIndex + 1]) throw new Error('Missing output');
const run = dirname(args[outputIndex + 1]);
const cache = join(run, 'cache');
mkdirSync(run, {recursive: true});
const invoke = (extra) => {
  const child = spawnSync(process.execPath, [cli, ...extra], {stdio: 'inherit'});
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
};
if (mode === 'seed') {
  if (!before || !existsSync(before)) throw new Error('Missing before corpus');
  if (existsSync(cache)) throw new Error('Use a fresh workdir for every run');
  invoke([
    'translate',
    'seed',
    '-i',
    before,
    '--source',
    'ru',
    '--target',
    'en',
    '--cache-dir',
    cache,
  ]);
  args.push('--cache-dir', cache);
} else {
  args.push('--no-cache');
}
args.push(
  '--report',
  join(run, 'run-report.json'),
  '--max-batch-tokens',
  '3000',
  '--max-output-tokens',
  '16000',
  '--max-concurrency',
  '3',
);
invoke(args);
```

The wrapper above is for RU to EN. Change both its seed languages and the eval
language arguments together for another pair. Do not share caches between
revisions, modes or repeats. A warm candidate cache invalidates a fresh-run
comparison. Use this wrapper only in real-model mode: the harness invokes the
CLI while capturing units in mock mode, with different batching and concurrency
requirements. Use the ordinary built CLI for mock checks.

## Run the comparison

First run the bundled offline smoke test from the validator checkout:

```sh
npm run translate:eval
```

Set `MODEL`, `API_BASE` and `AUTH_FILE` to approved provider settings. Use the
same model, prompts, glossary and budgets for both revisions. A fixed model tests
the CLI change in isolation; it does not prove equivalence with a consumer's
production model or all its tasklet settings.

```sh
for mode in full seed; do
  for version in baseline candidate; do
    if [ "$version" = baseline ]; then
      export VALIDATION_CLI="$BASELINE_CLI"
    else
      export VALIDATION_CLI="$CANDIDATE_CLI"
    fi
    export VALIDATION_MODE="$mode"
    corpus="$CORPUS_BEFORE"
    if [ "$mode" = seed ]; then corpus="$CORPUS_AFTER"; fi
    workdir="$VALIDATION_ROOT/$version-$mode"
    mkdir -p "$workdir"
    npm run translate:eval -- --real --repeats 3 \
      --cli "$VALIDATION_ROOT/cli-wrapper.mjs" --corpus "$corpus" \
      --workdir "$workdir" --report "$workdir/series.json" \
      --source ru-RU --target en-US --provider openai \
      --model "$MODEL" --api-base "$API_BASE" --auth "$AUTH_FILE" \
      > "$workdir/run.log" 2>&1
    result=$?
    printf '%s\n' "$result" > "$workdir/exit-code.txt"
  done
done
```

Run this loop in a shell without `set -e`: an eval FAIL should retain its report
and allow the other comparisons to finish. A missing report or provider failure
is an incomplete measurement, not a pass. Three repeats mean 12 translation
runs in total for the combined corpus; the judge adds model requests. Inspect
one initial run and token usage before increasing the corpus or repeat count.
Keep failed runs too. If a rerun is necessary, use a new directory and state why.

## Decide whether the change helps

Read `series.json`, individual `run-N/eval-report.json`, `run-report.json`,
translated Markdown under `run-N/out/en`, and the raw judge reports. Compare
each consumer and mode, not just one combined score:

- Added or removed Markdown/YFM structure, including inline code, emphasis,
  lists and paragraphs; inspect the exact source/output diff for each finding.
- Untranslated lines and `fixes.markupDamaged` / `untranslatedKept`. Keeping
  source text is safer than broken markup, but is not successful translation.
- `fixes.markupRetried`, request count and token usage. Repairs have a cost.
- Seeded cache hits and hints, unchanged existing translations, and the edited
  sentence. A successful seed command alone does not prove incremental reuse.
- Existing links localized in the reference locale, translated comments inside
  code fences, and pre-existing export defects. Keep raw violations visible,
  then explain shared findings separately from new regressions.

Strict eval checks fenced content byte-for-byte, so translating a code comment
can make the verdict red without introducing markup. Do not raise thresholds
just to get a green report. Similarity is a wording metric, and a high judge
score does not detect untranslated fallback reliably. The validator's series
thresholds apply to totals across repeats, not independently to each run.

Publish a compact result table with all runs, immutable CLI revisions, corpus
hashes, model/settings, defect categories and costs. State limits explicitly:
selected pages, language pair, controlled versus historical edits, public export
versus source files, and differences from production tasklet configuration.
Keep credentials, internal URLs/configurations and unapproved source documents
out of public PRs. Public availability alone does not grant redistribution rights;
prefer URLs/hashes and independently authored minimal fixtures.

## Turn observed failures into regression fixtures

Minimize a failure to a small, independently authored document. Preserve the
triggering structure but remove private names and unnecessary prose. Add a
hand-written expected translation and the malformed model response to
`src/commands/translate/providers/ai/__fixtures__/markup-regressions.json`
when the markup regression suite from PR #2308 is available. Its README explains
the fixture fields. Run:

```sh
npm test -- src/commands/translate/providers/ai/markup-regressions.spec.ts
```

Check both recovery after a retry and persistent failure with source fallback.
Include valid literal syntax as a negative control, and verify that a fallback
is not persisted as a successful cache entry. Temporarily disabling the guard
should make the new regression fail; restore it immediately and rerun the tests.
Do not replace expected output with snapshots generated by the implementation
under test. Live runs remain local evidence; deterministic fixtures keep the
regression reproducible without credentials or model nondeterminism.
