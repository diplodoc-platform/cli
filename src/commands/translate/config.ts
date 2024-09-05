import {cyan, green, underline} from 'chalk';
import {option, toArray} from '~/config';
import {options as globalOptions} from '~/program';

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

const useSource = option({
    flags: '--use-source',
    desc: `
        Use original texts as translated result.
        (Useful for translation debug.)
    `,
});

const useExperimentalParser = option({
    flags: '--use-experimental-parser',
    desc: `
        Use experimental parser for markdown documents.
    `,
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
    vars,
    dryRun,
    useSource,
    useExperimentalParser,
};
