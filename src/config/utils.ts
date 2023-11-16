import {Option} from 'commander';
import { yellow } from 'chalk';

const getPadX = (string: string) => {
    const match = /^(\s+)/.exec(string);
    const pad = (match && match[1]) || '';

    return new RegExp('^[\\s]{0,' + pad.length + '}');
};

export function trim(string: string) {
    let lines = string.split('\n');

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

type OptionInfo = {
    flags: string;
    desc: string;
    default?: any;
    required?: boolean;
    choices?: string[];
    hidden?: boolean;
    deprecated?: string;
    parser?: (value: string, previous: any) => any;
};

type Command = {
    name(): string;
    parent: Command | null;
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
        enumerable: true,
        get: () => {
            console.warn(`DEPRECATED: Option ${option} is deprecated`);

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

export function option(o: OptionInfo) {
    if (o.deprecated) {
        o.desc += deprecatedArg(o.deprecated);
    }

    const result = new Option(o.flags, o.desc);

    if ('default' in o) {
        result.default(o.default);
    }

    if ('choices' in o) {
        result.choices(o.choices);
    }

    if ('parser' in o) {
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
