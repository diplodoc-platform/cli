import {NoValue, evaluate} from '@diplodoc/liquid';

type WhenValue = string | boolean;

type BlockWithWhen = {
    when?: WhenValue;
    [key: string]: unknown;
};

export function evaluateWhen(
    whenValue: WhenValue,
    vars: Record<string, unknown>,
    skipMissingVars?: boolean,
): boolean {
    if (typeof whenValue === 'boolean') {
        return whenValue;
    }

    if (typeof whenValue === 'string') {
        const evalResult = evaluate(whenValue, vars, skipMissingVars);

        if (evalResult === NoValue && skipMissingVars) {
            return true;
        }

        return Boolean(evalResult);
    }

    return true;
}

function isBlockWithWhen(item: unknown): item is BlockWithWhen {
    return typeof item === 'object' && item !== null && 'when' in item;
}

export function filterBlocksByConditions<T>(
    obj: T,
    vars: Record<string, unknown>,
    skipMissingVars: boolean,
): T {
    if (Array.isArray(obj)) {
        return obj
            .filter((item) => {
                if (isBlockWithWhen(item)) {
                    if (item.when === null || item.when === undefined) {
                        return true;
                    }

                    return evaluateWhen(item.when, vars, skipMissingVars);
                }

                return true;
            })
            .map((item) => {
                if (isBlockWithWhen(item)) {
                    const {when: _, ...rest} = item;

                    return filterBlocksByConditions(rest, vars, skipMissingVars);
                }

                return filterBlocksByConditions(item, vars, skipMissingVars);
            }) as T;
    }

    if (obj && typeof obj === 'object' && obj !== null) {
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(obj)) {
            result[key] = filterBlocksByConditions(value, vars, skipMissingVars);
        }

        return result as T;
    }

    return obj;
}

export function hasWhenConditions(obj: unknown): boolean {
    if (Array.isArray(obj)) {
        return obj.some((item) => hasWhenConditions(item));
    }

    if (obj && typeof obj === 'object' && obj !== null) {
        if ('when' in obj) {
            return true;
        }

        return Object.values(obj).some((value) => hasWhenConditions(value));
    }

    return false;
}
