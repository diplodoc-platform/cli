import type {LoaderContext} from './loader';
import type {RawLeadingPage} from './types';

type WhenValue = string | boolean;

type BlockWithWhen = {
    when?: WhenValue;
    [key: string]: unknown;
};

function evaluateWhen(
    whenValue: WhenValue,
    vars: Record<string, unknown>,
    skipMissingVars: boolean,
): boolean {
    if (typeof whenValue === 'boolean') {
        return whenValue;
    }

    if (typeof whenValue === 'string') {
        const trimmed = whenValue.trim();

        if (trimmed in vars) {
            return Boolean(vars[trimmed]);
        }

        const eqIndex = trimmed.indexOf('==');

        if (eqIndex > 0) {
            const varName = trimmed.slice(0, eqIndex).trim();
            const expectedValue = trimmed
                .slice(eqIndex + 2)
                .trim()
                .replace(/^['"]|['"]$/g, '');

            if (varName in vars) {
                return String(vars[varName]) === expectedValue;
            }

            return skipMissingVars;
        }

        return skipMissingVars;
    }

    return true;
}

function isBlockWithWhen(item: unknown): item is BlockWithWhen {
    return typeof item === 'object' && item !== null && 'when' in item;
}

function filterBlocks<T>(obj: T, vars: Record<string, unknown>, skipMissingVars: boolean): T {
    if (Array.isArray(obj)) {
        return obj
            .filter((item) => {
                if (isBlockWithWhen(item)) {
                    if (item.when === null || item.when === undefined) {
                        return false;
                    }

                    return evaluateWhen(item.when, vars, skipMissingVars);
                }

                return true;
            })
            .map((item) => filterBlocks(item, vars, skipMissingVars)) as T;
    }

    if (obj && typeof obj === 'object' && obj !== null) {
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(obj)) {
            result[key] = filterBlocks(value, vars, skipMissingVars);
        }

        return result as T;
    }

    return obj;
}

export function resolveConditions(this: LoaderContext, yaml: RawLeadingPage): RawLeadingPage {
    const {skipMissingVars = false} = this.options;
    const vars = this.vars || {};

    yaml = filterBlocks(yaml, vars, skipMissingVars);

    return yaml;
}
