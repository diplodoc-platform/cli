import {Help as BaseHelp, Command as BaseCommand, Option} from 'commander';
import {bold, gray, cyan, underline} from 'chalk';
import {trim, option, cmd, toArray} from './utils';

const NAME = 'yfm';
const CONFIG = '.' + NAME;

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

const extensions = (program: {command: Command}) =>
    option({
        flags: '-e, --extensions <string>',
        desc: `
            Include external extension on startup.

            Relative paths resolving has difference for exec flags and ${CONFIG} config.
            For exec flags they resolves from execution directory.
            For config they resolves from config directory.

            Example:
              ${cmd(program)} -e @diplodoc/openapi-extension
              ${cmd(program)} -e ./local-extension
        `,
        parser: toArray,
    });

const input = (program: {command: Command}, defaultPath?: string) =>
    option({
        flags: '-i, --input <string>',
        desc: `
            Configure path to ${program.command.name()} input directory.
        `,
        required: true,
        default: defaultPath,
    });

const config = (program: {command: Command}, defaultConfig: string) =>
    option({
        flags: '-c, --config <string>',
        desc: `
            Configure path to ${program.command.name()} config.

            Relative paths resolves from execution directory.
            Other paths resolves from --input argument if present or from execution directory.

            Example:
              ${cmd(program)} -c .mydocs
              ${cmd(program)} -c ./mydocs.yaml
        `,
        default: defaultConfig,
    });

export const options = {
    quiet,
    strict,
    extensions,
    config,
    input,
};

export class Help extends BaseHelp {
    showGlobalOptions = true;

    optionDescription(option: Option) {
        const extraInfo = [];

        if (option.argChoices) {
            extraInfo.push(`(choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(', ')})`);
        }

        if (option.defaultValue !== undefined && !option.isBoolean()) {
            extraInfo.push(`(default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)})`);
        }

        if (extraInfo.length > 0) {
            return trim(option.description) + `\n\n${cyan(extraInfo.join(' '))}\n\n\n`;
        }

        return trim(option.description) + '\n\n\n';
    }

    wrap(str: string, width: number, indent: number, minColumnWidth = 40): string {
        const columnWidth = width - indent;
        if (columnWidth < minColumnWidth) {
            return str;
        }

        const leadingStr = str.slice(0, indent);
        const columnText = str.slice(indent).replace('\r\n', '\n');
        const indentString = ' '.repeat(indent);
        const zeroWidthSpace = '\u200B';
        const breaks = `\\s${zeroWidthSpace}`;
        // Match line end (so empty lines don't collapse),
        // or as much text as will fit in column, or excess text up to first break.
        const regex = new RegExp(`\n|.{1,${columnWidth - 1}}([${breaks}]|$)|[^${breaks}]+?([${breaks}]|$)`, 'g');
        const lines = columnText.match(regex) || [];

        return leadingStr + lines.map((line, i) => {
            if (line === '\n') {
                return ''; // preserve empty lines
            }

            return ((i > 0) ? indentString : '') + line.trimEnd();
        }).join('\n');
    }
}

export class Command extends BaseCommand {

    _helpDescription = 'Display help for command';

    _helpCommandDescription = 'Display help for command';

    createHelp() {
        return new Help();
    }
}

