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

export function toArray(value: string | string[], previous: string | string[]) {
    value = ([] as string[]).concat(value);

    if (previous) {
        previous = ([] as string[]).concat(previous);

        return [...new Set([...previous, ...value])];
    }

    return value;
}

export type OptionInfo = {
    flags: string;
    desc: string;
    env?: string;
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    default?: any;
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    defaultInfo?: any;
    required?: boolean;
    choices?: string[];
    variadic?: boolean;
    hidden?: boolean;
    deprecated?: string;
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    parser?: (value: string, previous: any) => any;
};

export function cmd(command: Command) {
    const cmdName = command.name();

    let ancestorCmdNames = '';
    for (let ancestorCmd = command.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
        ancestorCmdNames = ancestorCmd.name() + ' ' + ancestorCmdNames;
    }

    return ancestorCmdNames + cmdName;
}

export function args(command: Command | null) {
    let args: string[] | undefined;

    while (command) {
        // FIXME: This is probably broken
        // @ts-expect-error
        args = command.rawArgs || args;
        command = command.parent;
    }

    return args || [];
}

const deprecatedArg = (reason: string) => yellow('\nDEPRECATED:\n' + reason);

export const scope = (scopeName: string) => (config: Hash) => {
    return config[scopeName] || config;
};

export const strictScope = (scopeName: string) => (config: Hash) => {
    if (scopeName in config) {
        return config[scopeName];
    } else {
        const error = new TypeError(`Scope ${scopeName} doesn't exist in config`);
        error.code = 'ScopeException';
        throw error;
    }
};

// eslint-disable-next-line  @typescript-eslint/no-explicit-any
export const deprecated = (config: Hash, option: string, value: () => any) => {
    Object.defineProperty(config, option, {
        enumerable: false,
        get: () => {
            // TODO: uncomment under system flag
            // console.warn(`DEPRECATED: Option ${ option } is deprecated`);

            return value();
        },
    });
};

export const defined = (option: string, ...scopes: Hash[]) => {
    for (const scope of scopes) {
        if (option in scope) {
            return scope[option];
        }
    }

    return null;
};

// eslint-disable-next-line  @typescript-eslint/no-explicit-any
export const valuable = (...values: any[]) => values.some((value) => value !== null);

const OptionSource = Symbol('OptionSource');

export type ExtendedOption = Option & {
    defaultInfo?: string;
    [OptionSource]: OptionInfo;
};

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

    if (o.env) {
        result.env(o.env);
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

export function withConfigUtils<T extends Hash = Hash>(path: string, config: T): Config<T> {
    return {
        ...config,
        [configRoot]: dirname(resolve(path)),
        [configPath]: resolve(path),
    };
}

export async function resolveConfig<T extends Hash = {}>(
    path: string,
    {
        defaults,
        fallback,
        filter = identity,
    }: {
        filter?: (data: Hash) => T;
        defaults?: T;
        fallback?: T | null;
    } = {},
): Promise<Config<T>> {
    try {
        const content = await readFile(resolve(path), 'utf8');
        const data = load(content) as Hash;

        return withConfigUtils(path, {
            ...defaults,
            ...filter(data),
        });
        // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    } catch (error: any) {
        switch (error.code) {
            case 'YAMLException':
                throw new Error(`Failed to parse ${path}: ${error.message}`);
            case 'ScopeException':
            case 'ENOENT':
                if (fallback) {
                    return withConfigUtils(path, fallback);
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

    visibleOptions(command: Command) {
        const options = super.visibleOptions(command);
        const flags = new Set(['-h, --help', '--version']);

        return options.filter((option) => !flags.has(option.flags));
    }

    visibleGlobalOptions(command: Command) {
        const options = this.visibleOptions(command);
        const helpOption = command.createOption(command._helpLongFlag, command._helpDescription);
        const globalOptions = super.visibleGlobalOptions(command);

        const flags = options.reduce((acc, option) => {
            acc.add(option.flags);

            return acc;
        }, new Set<string>());

        const filtered = globalOptions
            .filter((option) => !flags.has(option.flags))
            .sort((_, b) => (b.flags === '--version' ? -1 : 0));

        return filtered.concat(helpOption);
    }

    commandUsage(command: Command) {
        const usage = super.commandUsage(command);

        return trim(usage.replace(/{{PROGRAM}}/g, cmd(command)));
    }

    commandDescription(command: Command) {
        const desc = super.commandDescription(command);

        return trim(desc.replace(/{{PROGRAM}}/g, cmd(command)));
    }

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

    // Ugly method - copypasted from commander source
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
    parent: Command | null = null;

    _helpLongFlag = '--help';

    _helpShortFlag = '-h';

    _helpDescription = 'Display help for command';

    _helpCommandDescription = 'Display help for command';

    missingMandatoryOptionValue(option: ExtendedOption) {
        const rawArgs = args(this);
        if (rawArgs.includes(this._helpLongFlag) || rawArgs.includes(this._helpShortFlag)) {
            return;
        }

        // @ts-ignore
        super.missingMandatoryOptionValue(option);
    }

    error(error: string): never {
        throw error;
    }

    addOption(o: Option | ExtendedOption): this {
        super.addOption(o);

        if (o.isBoolean() && (o as ExtendedOption)[OptionSource]) {
            const original = (o as ExtendedOption)[OptionSource];
            const flags = original.flags
                // replace short flags with void
                .replace(/(^|\s+|,)-\w+\s*($|,?\s*)/g, '')
                // add negation to long options
                .replace(/--/g, '--no-');

            const negated = {
                ...original,
                flags,
                desc: 'auto negation',
                hidden: true,
            };

            delete negated.default;
            delete negated.defaultInfo;
            delete negated.deprecated;

            super.addOption(option(negated));
        }

        if (o.description) {
            o.description = o.description.replace(/{{PROGRAM}}/g, cmd(this));
        }

        return this;
    }

    createHelp() {
        return new Help();
    }
}
