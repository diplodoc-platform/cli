import {resolve} from 'node:path';
import {bold} from 'chalk';
import {option, toArray} from '~/config';

export const NAME = 'yfm';

const CONFIG = '.yfm';

export const USAGE = `<command> [global-options] [options]

${NAME} build -i ./src -o ./dst

If no command passed, ${bold('build')} command will be called by default.`;

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

const input = (defaultPath?: string) =>
    option({
        flags: '-i, --input <string>',
        desc: `Configure path to {{PROGRAM}} input directory.`,
        default: defaultPath,
        parser: absolute,
    });

const output = (defaultPath?: string) =>
    option({
        flags: '-o, --output <string>',
        desc: `Configure path to {{PROGRAM}} output directory.`,
        default: defaultPath,
        parser: absolute,
    });

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

// ? may be need to add
// const themeConfig = (defaultConfig: string) =>
//     option({
//         flags: '-tc, --theme-config <string>',
//         desc: `
//                 Configure path to {{PROGRAM}} theme config.

//                 Relative paths resolves from execution directory.
//                 Other paths resolves from --input argument if present or from execution directory.

//                 Example:
//                   {{PROGRAM}} -c ./theme.yaml
//                   {{PROGRAM}} -c .theme
//             `,
//         default: defaultConfig,
//     });

const absolute = (path: string) => resolve(process.cwd(), path);

export const options = {
    quiet,
    strict,
    extensions,
    config,
    // themeConfig,
    input,
    output,
};
