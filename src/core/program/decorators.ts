import type {BaseConfig} from '~/core/program/types';

import {merge} from 'lodash';

const configDefaults = Symbol('defaultConfig');

type DefaultConfig<TConfig extends BaseConfig> = {
    defaults: () => Partial<TConfig>;
    scope?: string;
    strictScope?: string;
};

export function getConfigDefaults<TConfig extends BaseConfig>(
    target: InstanceType<ClassType>,
): DefaultConfig<TConfig> {
    return target[configDefaults] || {};
}

export function withConfigDefaults<C extends () => object>(config: C) {
    return function <T extends ClassType>(Class: T, {kind}: ClassDecoratorContext): T | void {
        if (kind !== 'class') {
            throw new TypeError(`Decorator 'withConfigDefaults' is not applicable to '${kind}'.`);
        }

        return class extends Class {
            get [configDefaults](): C {
                const moreDefaults = super[configDefaults] || {};

                return merge({}, moreDefaults, config());
            }
        };
    };
}

const configScope = Symbol('configScope');

type Scope = {
    scope?: string;
    strictScope?: string;
};

export function getConfigScope(target: InstanceType<ClassType>): Scope {
    return target[configScope] || {};
}

export function withConfigScope(scope: string, options?: {strict: boolean}) {
    return function <T extends ClassType>(Class: T, {kind}: ClassDecoratorContext): T | void {
        if (kind !== 'class') {
            throw new TypeError(`Decorator 'withConfigScope' is not applicable to '${kind}'.`);
        }

        return class extends Class {
            get [configScope](): Scope {
                return options?.strict ? {strictScope: scope} : {scope};
            }
        };
    };
}
