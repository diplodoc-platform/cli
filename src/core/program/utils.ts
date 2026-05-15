import type {BaseArgs, BaseConfig} from '~/core/program/types';
import type {BaseProgram} from '~/core/program/index';

import {isAbsolute} from 'node:path';

export function isRelative(path: string | undefined) {
    return /^\.{1,2}\//.test(path || '');
}

export function requireExtension(name: string) {
    if (isRelative(name) || isAbsolute(name)) {
        return require(name);
    }

    const local = (name: string) => {
        if (name.startsWith('@')) {
            return undefined;
        }

        return '@diplodoc/cli/' + name;
    };

    const scoped = (name: string, fixed = false) => {
        if (name.startsWith('@')) {
            return undefined;
        }

        return '@diplodoc/' + name + (fixed ? '-extension' : '');
    };

    const precise = (name: string, fixed = false) => {
        return name + (fixed ? '-extension' : '');
    };

    const variants = [
        local(name),
        scoped(name),
        scoped(name, true),
        precise(name),
        precise(name, true),
    ].filter(Boolean);

    while (variants.length) {
        const variant = variants.shift() as string;
        try {
            return require(variant);
        } catch {}
    }

    throw new Error(`Unable to resolve '${name}' extension`);
}

export function isProgram<TConfig extends BaseConfig, TArgs extends BaseArgs>(
    module: unknown,
): module is BaseProgram<TConfig, TArgs> {
    return Boolean(module && typeof (module as BaseProgram).init === 'function');
}
