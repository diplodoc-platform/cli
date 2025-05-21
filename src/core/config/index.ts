import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {Command as BaseCommand, Help as BaseHelp, Option} from 'commander';
import {identity, merge, isObject} from 'lodash';
import {cyan, yellow} from 'chalk';
import {load} from 'js-yaml';
import {dedent} from 'ts-dedent';

type ExtendedError = Error & {code: string};

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
        // @ts-ignore
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
        const error = new TypeError(`Scope ${scopeName} doesn't exist in config`) as ExtendedError;
        error.code = 'ScopeException';
        throw error;
    }
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
export const valuable = (...values: any[]) =>
    values.some((value) => value !== null && value !== undefined);

export const toggleable = <C extends Hash<unknown>>(
    field: string,
    args: Hash<unknown>,
    config: C,
) => {
    const result = isObject(config[field]) ? {...(config[field] as Hash)} : {enabled: false};
    // eslint-disable-next-line no-nested-ternary
    result.enabled = defined(field, args)
        ? Boolean(args[field])
        : isObject(config[field])
          ? defined('enabled', config[field] as Hash, {enabled: true})
          : defined(field, config, {[field]: false});

    return result as C & {enabled: boolean};
};

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

type ConfigUtils = {
    [configPath]: AbsolutePath | null;
    resolve(subpath: string): AbsolutePath;
};

export type Config<T> = T & ConfigUtils;

export function withConfigUtils<T extends Hash = Hash>(path: string | null, config: T): Config<T> {
    return Object.setPrototypeOf(
        {...config},
        {
            resolve: (subpath: string): AbsolutePath => {
                if (path === null) {
                    return resolve(subpath) as AbsolutePath;
                }

                return resolve(dirname(path), subpath) as AbsolutePath;
            },
            [configPath]: path === null ? path : resolve(path),
        },
    );
}

export async function resolveConfig<T extends Hash = {}>(
    path: AbsolutePath,
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
        const content = (await readFile(path, 'utf8')) || '{}';
        const data = load(content) as Hash;

        return withConfigUtils(path, merge({}, defaults, filter(data)));
        // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    } catch (error: any) {
        switch (error.code) {
            case 'YAMLException':
                throw new Error(`Failed to parse ${path}: ${error.message}`);
            case 'ScopeException':
            case 'ENOENT':
                if (fallback) {
                    return withConfigUtils(null, fallback);
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

        return dedent(usage.replace(/{{PROGRAM}}/g, cmd(command)));
    }

    commandDescription(command: Command) {
        const desc = super.commandDescription(command);

        return dedent(desc.replace(/{{PROGRAM}}/g, cmd(command)));
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
            return dedent(option.description) + `\n\n${cyan(extraInfo.join(' '))}\n\n\n`;
        }

        return dedent(option.description) + '\n\n\n';
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

        const camelcase = camelCaseOption(o as ExtendedOption);
        if (camelcase) {
            super.addOption(camelcase);
        }

        if (o.isBoolean()) {
            super.addOption(negatedOption(o as ExtendedOption));
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

function camelCaseOption(o: ExtendedOption) {
    const original = (o as ExtendedOption)[OptionSource];
    const flags = original.flags
        // replace short flags with void
        .replace(/(^|\s+|,)-\w+\s*($|,?\s*)/g, '')
        // convert to camel case (ignoring option first letter)
        .replace(/([^-])-([a-z])/g, (_, $1, $2) => $1 + $2.toUpperCase());

    if (original.flags.includes(flags)) {
        return null;
    }

    const camelcase = {
        ...original,
        flags,
        desc: 'auto camelcase',
        deprecated: 'Use "kebab case" variant of this option.',
        hidden: true,
    };

    delete camelcase.default;
    delete camelcase.defaultInfo;

    return option(camelcase);
}

function negatedOption(o: ExtendedOption) {
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

    return option(negated);
}
