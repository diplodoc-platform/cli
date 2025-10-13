import type {OptionInfo} from '~/core/config';

import {resolve} from 'node:path';
import {bold} from 'chalk';

import {option, toArray} from '~/core/config';

export const NAME = 'yfm';

const CONFIG = '.yfm';

export const USAGE = `<command> [global-options] [options]

${NAME} build -i ./src -o ./dst

If no command passed, ${bold('build')} command will be called by default.`;

const absolute = (path: string) => resolve(process.cwd(), path);

const quiet = option({
    flags: '-q, --quiet',
    desc: `
        Run in quiet mode.
        Process will not write logs to stdout.
    `,
    default: false,
});

const strict = option({
    flags: '-s, --strict',
    desc: `
        Run in strict mode.
        Process will exit with non zero code if there was some errors or warnings.
    `,
    default: false,
});

const jobs = option({
    flags: '-j, --jobs [number]',
    desc: `
        Run program in <number> parallel threads.
        This can speedup CPU bound operations.

        If number not passed, program will run cpus - 1 thread.

        Example:
            {{PROGRAM}} build -i . -o ../build -j 4
            {{PROGRAM}} build -i . -o ../build -j
    `,
    default: 0,
});

const profile = option({
    flags: '--profile [seconds]',
    desc: `
        Enable CPU profiling for debug purpose.
        Works also for threading mode.
    `,
    default: false,
    hidden: true,
    parser: (value) => {
        return parseInt(value, 10);
    },
});

const extensions = option({
    flags: '-e, --extensions <string>',
    desc: `
        Include external extension on startup.

        Relative paths resolving has difference for exec flags and ${CONFIG} config.
        For exec flags they resolves from execution directory.
        For config they resolves from config directory.

        Example:
          {{PROGRAM}} -e @diplodoc/openapi-extension
          {{PROGRAM}} -e ./local-extension
    `,
    parser: toArray,
});

const input = (defaults: string | Partial<OptionInfo> = {}) => {
    const defaultPath = typeof defaults === 'string' ? defaults : defaults.default;
    const overrides = typeof defaults === 'string' ? {} : defaults;

    return option({
        ...overrides,
        flags: '-i, --input <string>',
        desc: `Configure path to {{PROGRAM}} input directory.`,
        default: defaultPath ? absolute(defaultPath) : undefined,
        parser: absolute,
    });
};

const output = (defaults: string | Partial<OptionInfo> = {}) => {
    const defaultPath = typeof defaults === 'string' ? defaults : defaults.default;
    const overrides = typeof defaults === 'string' ? {} : defaults;

    return option({
        ...overrides,
        flags: '-o, --output <string>',
        desc: `Configure path to {{PROGRAM}} output directory.`,
        default: defaultPath ? absolute(defaultPath) : undefined,
        parser: absolute,
    });
};

const config = (defaultConfig: string) =>
    option({
        flags: '-c, --config <string>',
        desc: `
            Configure path to {{PROGRAM}} config.

            Relative paths resolves from execution directory.
            Other paths resolves from --input argument if present or from execution directory.

            Example:
              {{PROGRAM}} -c .mydocs
              {{PROGRAM}} -c ./mydocs.yaml
        `,
        default: defaultConfig,
    });

export const options = {
    quiet,
    strict,
    jobs,
    profile,
    extensions,
    config,
    input,
    output,
};
