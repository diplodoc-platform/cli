import type {BaseConfig} from '~/core/program/types';

const defaultConfig = Symbol('defaultConfig');

type DefaultConfig<TConfig extends BaseConfig> = {
    defaults: () => Partial<TConfig>;
    scope?: string;
    strictScope?: string;
};

export function getDefaultConfig<TConfig extends BaseConfig>(
    target: InstanceType<ClassType>,
): DefaultConfig<TConfig> {
    return {
        defaults: () => ({}) as Partial<TConfig>,
        ...target[defaultConfig],
    };
}

export function withDefaultConfig<C extends object>(config: C) {
    return function <T extends ClassType>(Class: T, {kind}: ClassDecoratorContext): T | void {
        if (kind !== 'class') {
            return;
        }

        return class extends Class {
            readonly [defaultConfig] = config;
        };
    };
}
