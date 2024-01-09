import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {Command as BaseCommand, Help as BaseHelp, Option} from 'commander';
import {identity} from 'lodash';
import {cyan, yellow} from 'chalk';
import {load} from 'js-yaml';

const getPadX = (string: string) => {
    const match = /^(\s+)/.exec(string);
    const pad = (match && match[1]) || '';

    return new RegExp('^[\\s]{0,' + pad.length + '}');
};

export function trim(string: string | TemplateStringsArray): string {
    let lines = Array.isArray(string) ? (string as string[]) : (string as string).split('\n');

    let pad: RegExp;
    if (lines[0].trim() === '') {
        pad = getPadX(lines[1]);
        lines = lines.slice(1);
    } else {
        pad = getPadX(lines[0]);
    }

    lines = lines.map((line) => line.replace(pad, ''));

    return lines.join('\n').trim();
}

export function toArray(value: string | string[]): string[] {
    if (!Array.isArray(value)) {
        value = [value];
    }

    return value;
}

export type OptionInfo = {
    flags: string;
    desc: string;
    default?: any;
    defaultInfo?: any;
    required?: boolean;
    choices?: string[];
    hidden?: boolean;
    deprecated?: string;
    parser?: (value: string, previous: unknown) => unknown;
};

export function cmd(program: {command: Command}) {
    const cmdName = program.command.name();

    let ancestorCmdNames = '';
    for (let ancestorCmd = program.command.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
        ancestorCmdNames = ancestorCmd.name() + ' ' + ancestorCmdNames;
    }

    return ancestorCmdNames + cmdName;
}

const deprecatedArg = (reason: string) => yellow('\nDEPRECATED:\n' + reason);

export const deprecated = (config: Record<string, any>, option: string, value: () => any) => {
    Object.defineProperty(config, option, {
        enumerable: false,
        get: () => {
            // TODO: uncomment under system flag
            // console.warn(`DEPRECATED: Option ${ option } is deprecated`);

            return value();
        },
    });
};

export const defined = (option: string, ...scopes: Record<string, any>[]) => {
    for (const scope of scopes) {
        if (option in scope) {
            return scope[option];
        }
    }

    return null;
};

export const valuable = (...values: any[]) => values.some((value) => value !== null);

type ExtendedOption = Option & {
    defaultInfo?: string;
    [OptionSource]: OptionInfo;
};

const OptionSource = Symbol('OptionSource');

export function option(o: OptionInfo) {
    if (o.deprecated) {
        o.desc += deprecatedArg(o.deprecated);
    }

    const result = new Option(o.flags, o.desc) as ExtendedOption;

    result[OptionSource] = o;

    if ('default' in o) {
        result.default(o.default);
    }

    if ('defaultInfo' in o) {
        result.defaultInfo = o.defaultInfo;
    }

    if (o.choices) {
        result.choices(o.choices as string[]);
    }

    if (o.parser) {
        result.argParser(o.parser);
    }

    if ('required' in o) {
        result.makeOptionMandatory(true);
    }

    if ('hidden' in o) {
        result.hideHelp(o.hidden);
    }

    return result;
}

export const configPath = Symbol('configPath');

export const configRoot = Symbol('configRoot');

type ConfigUtils = {
    [configPath]?: string;
    [configRoot]: string;
};

export type Config<T> = T & ConfigUtils;

export async function resolveConfig<T extends Record<string, any> = {}>(
    path: string,
    {
        defaults,
        fallback,
        filter = identity,
    }: {
        filter?: (data: Record<string, unknown>) => T;
        defaults?: T;
        fallback?: T | null;
    } = {},
): Promise<Config<T>> {
    const config = {
        [configRoot]: dirname(resolve(path)),
    };

    try {
        const content = await readFile(resolve(path), 'utf8');
        const data = load(content) as Record<string, unknown>;

        return Object.assign(config, {[configPath]: resolve(path)}, defaults, filter(data));
    } catch (error: any) {
        switch (error.name) {
            case 'YAMLException':
                throw `Failed to parse ${path}: ${error.message}`;
            case 'ENOENT':
                if (fallback !== undefined) {
                    return Object.assign(config, fallback);
                } else {
                    throw error;
                }
            default:
                throw error;
        }
    }
}

export class Help extends BaseHelp {
    showGlobalOptions = true;

    optionDescription(option: ExtendedOption) {
        const extraInfo = [];

        if (option.argChoices) {
            extraInfo.push(
                `(choices: ${option.argChoices
                    .map((choice) => JSON.stringify(choice))
                    .join(', ')})`,
            );
        }

        if (
            (option.defaultValue !== undefined || option.defaultInfo !== undefined) &&
            !option.isBoolean()
        ) {
            const value =
                option.defaultValueDescription ||
                JSON.stringify(option.defaultValue || option.defaultInfo);
            extraInfo.push(`(default: ${value})`);
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
        const regex = new RegExp(
            `\n|.{1,${columnWidth - 1}}([${breaks}]|$)|[^${breaks}]+?([${breaks}]|$)`,
            'g',
        );
        const lines = columnText.match(regex) || [];

        return (
            leadingStr +
            lines
                .map((line, i) => {
                    if (line === '\n') {
                        return ''; // preserve empty lines
                    }

                    return (i > 0 ? indentString : '') + line.trimEnd();
                })
                .join('\n')
        );
    }
}

export class Command extends BaseCommand {
    _helpDescription = 'Display help for command';

    _helpCommandDescription = 'Display help for command';

    _exit(code: number, error?: string, message?: string) {
        if (error) {
            throw message || error;
        } else {
            process.exit(code);
        }
    }

    addOption(o: Option | ExtendedOption): this {
        super.addOption(o);

        if (o.isBoolean() && (o as ExtendedOption)[OptionSource]) {
            const original = (o as ExtendedOption)[OptionSource];
            const negated = {
                ...original,
                flags: original.flags.replace('--', '--no-'),
                desc: 'auto negation',
                hidden: true,
            };

            delete negated.default;
            delete negated.defaultInfo;
            delete negated.deprecated;

            super.addOption(option(negated));
        }

        return this;
    }

    createHelp() {
        return new Help();
    }
}
