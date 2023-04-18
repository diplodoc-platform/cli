import {LintRule, LintConfig} from '@doc-tools/transform/lib/yfmlint';

import {PluginOptions, Plugin, CollectionOfPluginsFunction} from '../models';
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

    return (output: string, options: PluginOptions) => {
        let collectsOutput = output;

        pluginsWithCollect.forEach((plugin: Plugin) => {
            const collectOutput = plugin.collect(collectsOutput, options);

            collectsOutput = typeof collectOutput === 'string' ? collectOutput : collectsOutput;
        });

        return collectsOutput;
    };
}

function getAllPlugins(): Function[] {
    const customPlugins = getCustomPlugins();
    return [...YFM_PLUGINS, ...customPlugins];
}

function getCustomPlugins(): Function[] {
    try {
        const customPlugins = require('./plugins');
        return Array.isArray(customPlugins) ? customPlugins : [];
    } catch (e) {
        return [];
    }
}

export function getHeadContent(): string {
    try {
        return require('./head-content.js');
    } catch (e) {
        return '';
    }
}

export function getCustomLintRules(): LintRule[] {
    try {
        return require('./lint-rules');
    } catch (e) {
        return [];
    }
}

export function getDefaultLintConfig(): LintConfig | undefined {
    try {
        return require('./default-lint-config');
    } catch (e) {
        return undefined;
    }
}
