import {cyan, green, underline} from 'chalk';

import {option, toArray} from '~/core/config';
import {options as globalOptions} from '~/commands/config';

export const NAME = 'translate';

export const DESCRIPTION = `
    Translate documentation from source to target language using configured translation provider.

    Select a provider to read more help:
      {{PROGRAM}} ${green('--provider yandex')} --help
`;

const provider = option({
    flags: '--provider <value>',
    desc: 'Configure translation service provider.',
});

const source = option({
    flags: '-sl, --source <value>',
    desc: `
        Source text language to translate from.
        Specified in ISO 639-1 format (for example, ru or ru-RU).
    `,
});

const target = option({
    flags: '-tl, --target <value>',
    desc: `
        Target language to translate the text.
        Specified in ISO 639-1 format (for example, en or en-US).
    `,
    parser: toArray,
});

const files = option({
    flags: '--files <path...>',
    desc: `
        List of paths (relative to input) need to be translated.
        Can be direct file path or file ${underline('filter list')}.

        If selected, then ${underline('include')} and ${underline(
            'exclude',
        )} options will be ignored.

        Read more about ${underline('filter list')} format in documentation ${cyan('docs')}.

        Example:
            {{PROGRAM}} --files ./some/path/to/file.md --files ./some/path/to/index.yaml
            {{PROGRAM}} --files ./some/path/to/translate.list
    `,
    parser: toArray,
});

const include = option({
    flags: '--include <value>',
    desc: `
        Relative to input filtering rule for files need to be translated.
        Can be direct file path or glob filter.

        Usage of include flag will reset default include rules.
        If you need to apply also default rules use special ${cyan('--include ...')}

        Example:
          {{PROGRAM}} --include some/direct/path.md
          {{PROGRAM}} --include subpath/glob/**/*.md
          {{PROGRAM}} --include filter.list
          {{PROGRAM}} --include filter.list --include ...
    `,
    parser: toArray,
});

const exclude = option({
    flags: '--exclude <value>',
    desc: `
        Relative to input filtering rule for files need to be skipped on translation.
        Can be direct file path or glob filter.

        Example:
          {{PROGRAM}} --exclude subpath/glob/**/*.md
    `,
    parser: toArray,
});

const includeVcsDiff = option({
    flags: '--include-vcs-diff [ref]',
    desc: `
        Add files changed in the current VCS working copy (git or arc)
        to the list of files for translation.

        Optional value configures the ref to compute the diff against.
        By default the diff is computed against HEAD.
        Untracked files are always included.

        Fails if input is not inside a git or arc repository.
        If there are no changes, the command finishes successfully without translation.

        Can be combined with ${cyan('--include')} - files from both sources are translated.
        ${cyan('--exclude')} is also applied to files from VCS diff.

        Example:
          {{PROGRAM}} --include-vcs-diff
          {{PROGRAM}} --include-vcs-diff trunk
          {{PROGRAM}} --include-vcs-diff origin/main
    `,
});

const vars = option({
    flags: '-v, --vars <json>',
    desc: `
        Pass list of variables directly to translation.
        Variables should be passed in JSON format.
        Translation command ignores any presets.yaml.

        Example:
          {{PROGRAM}} -i ./ -o ./build -v '{"name":"test"}'
    `,
    parser: (value) => JSON.parse(value),
});

const dryRun = option({
    flags: '--dry-run',
    desc: 'Do not execute target translation provider, but only calculate required quota.',
});

const timeout = option({
    flags: '--timeout <ms>',
    desc: `
        Timeout in milliseconds for a single translation API request.
        Increase this value if the provider times out on large files.
    `,
    defaultInfo: '5000',
    parser: Number,
});

const copyAssets = option({
    flags: '--copy-assets',
    desc: `
        Copy non-translatable files (images and other assets) from the source
        language directory to the target language directories in the output,
        so the translated file set is buildable on its own.
    `,
});

const report = option({
    flags: '--report <path>',
    desc: `
        Write a machine-readable JSON report of the translation run to the
        given path: timings, volume (files, units, characters, tokens),
        cache and fallback usage, judge scores and errors.

        The report schema is versioned (see the schemaVersion field).
        Disabled by default. A short run summary is always logged.

        Example:
          {{PROGRAM}} --report ./translate-report.json
    `,
});

const useSource = option({
    flags: '--use-source',
    desc: `
        Use original texts as translated result.
        (Useful for translation debug.)
    `,
});

const schema = option({
    flags: '--schema <path...>',
    desc: `
        List of paths to custom translate schema files.

        Example:
            {{PROGRAM}} --schema ./some/path/to/file.yaml ./some/path/toAnother/file.yaml

    `,
    parser: toArray,
});

const filter = option({
    flags: '--filter',
    desc: `
        If enabled translates only resolved files from toc.yaml
        If disabled translates all files from project.

        Disabled by default.

        Example:
            {{PROGRAM}} --filter

    `,
    default: false,
});

const noRefResolve = option({
    flags: '--no-ref-resolve',
    desc: `
        Disables resolving ref in openapi whilest translate extract command.

        Example:
            {{PROGRAM}} --no-ref-resolve

    `,
    default: true,
});

export const options = {
    input: globalOptions.input,
    output: globalOptions.output,
    config: globalOptions.config,
    provider,
    source,
    target,
    files,
    include,
    exclude,
    includeVcsDiff,
    vars,
    dryRun,
    copyAssets,
    timeout,
    report,
    useSource,
    schema,
    filter,
    noRefResolve,
};
