import {resolve} from 'node:path';
import {bold, underline} from 'chalk';

import {option} from '~/core/config';
import {options as buildOptions} from '~/commands/build/config';

export const NAME = 'content';

export const DESCRIPTION = `
    Process a single file and print the result to stdout (or write to a file).

    Outputs preprocessed content in the selected format:
      - ${bold('md')}  — self-contained markdown (includes/autotitles merged) with frontmatter;
      - ${bold('html')} — content HTML fragment only (no toc, header or page chrome).

    Errors and warnings are written to stderr; on stdout the result is wrapped
    in delimiter markers. On any build error the process exits with a non-zero code.

    Use ${bold('--raw')} to print only the content to stdout (no delimiter markers
    and no framework banners), e.g. when piping the result to another tool.

    Example:
      {{PROGRAM}} ${underline('content -i ./page.md -f md')}
      {{PROGRAM}} ${underline('content -i ./page.md -f html -o ./page.html')}
      {{PROGRAM}} ${underline('content -i ./page.md -f md --raw > page.md')}
`;

const absolute = (path: string) => resolve(process.cwd(), path);

const input = option({
    flags: '-i, --input <file>',
    desc: `Path to a single markdown file to process.`,
    parser: absolute,
});

const output = option({
    flags: '-o, --output <file>',
    desc: `
        Path to the output file.
        If omitted, the result is written to stdout (wrapped in delimiter markers).
    `,
    parser: absolute,
});

const watch = option({
    flags: '-w, --watch',
    desc: `
        Watch the input file (and its includes/presets) and re-render on changes.
    `,
    default: false,
});

const raw = option({
    flags: '--raw',
    desc: `
        Print only the content to stdout, without the start/end delimiter markers
        and without framework banners (version line, build timer, completion banner).
        Has no effect when -o/--output is set.
    `,
    default: false,
});

export const options = {
    input,
    output,
    watch,
    raw,
    outputFormat: buildOptions.outputFormat,
    varsPreset: buildOptions.varsPreset,
    vars: buildOptions.vars,
    allowHtml: buildOptions.allowHtml,
    sanitizeHtml: buildOptions.sanitizeHtml,
    multilineTermDefinitions: buildOptions.multilineTermDefinitions,
    idGenerator: buildOptions.idGenerator,
    maxInlineSvgSize: buildOptions.maxInlineSvgSize,
    maxOpenapiIncludeSize: buildOptions.maxOpenapiIncludeSize,
    maxOpenapiIncludeInlineSize: buildOptions.maxOpenapiIncludeInlineSize,
    langs: buildOptions.langs,
    strict: buildOptions.strict,
    config: buildOptions.config,
};
