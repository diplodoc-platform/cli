import {LintConfig, LintRule} from '@diplodoc/transform/lib/yfmlint';

import {CollectionOfPluginsFunction, Plugin, PluginOptions} from '../models';
import {YFM_PLUGINS} from '../constants';

let plugins: Function[] | Plugin[];
let collectionOfPlugins: CollectionOfPluginsFunction;

export function setPlugins(): void {
    plugins = getAllPlugins();
    collectionOfPlugins = makeCollectOfPlugins();
}

export function getPlugins() {
    return plugins;
}

export function getCollectOfPlugins(): CollectionOfPluginsFunction {
    return collectionOfPlugins;
}

function makeCollectOfPlugins(): CollectionOfPluginsFunction {
    const pluginsWithCollect = (plugins as Plugin[]).filter((plugin: Plugin) => {
        return typeof plugin.collect === 'function';
    });

    return async (output: string, options: PluginOptions) => {
        let collectsOutput = output;

        for (const plugin of pluginsWithCollect) {
            const collectOutput = await plugin.collect(collectsOutput, options);
            collectsOutput = typeof collectOutput === 'string' ? collectOutput : collectsOutput;
        }

        return collectsOutput;
    };
}

function getAllPlugins(): Function[] {
    const customPlugins = getCustomPlugins();
    return [...YFM_PLUGINS, ...customPlugins];
}

function getCustomPlugins(): Function[] {
    try {
        const customPlugins = require(require.resolve('./plugins'));
        return Array.isArray(customPlugins) ? customPlugins : [];
    } catch (e) {
        return [];
    }
}

export function getHeadContent(): string {
    try {
        return require(require.resolve('./head-content.js'));
    } catch (e) {
        return '';
    }
}

export function getCustomLintRules(): LintRule[] {
    try {
        return require(require.resolve('./lint-rules'));
    } catch (e) {
        return [];
    }
}

export function getDefaultLintConfig(): LintConfig | undefined {
    try {
        return require(require.resolve('./default-lint-config'));
    } catch (e) {
        return undefined;
    }
}
