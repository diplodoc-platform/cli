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
        const customPlugins = requireDynamically('./plugins');
        return Array.isArray(customPlugins) ? customPlugins : [];
    } catch (e) {
        return [];
    }
}

export function getHeadContent(): string {
    try {
        return requireDynamically('./head-content.js');
    } catch (e) {
        return '';
    }
}

export function getCustomLintRules(): LintRule[] {
    try {
        return requireDynamically('./lint-rules');
    } catch (e) {
        return [];
    }
}

export function getDefaultLintConfig(): LintConfig | undefined {
    try {
        return requireDynamically('./default-lint-config');
    } catch (e) {
        return undefined;
    }
}

// https://github.com/webpack/webpack/issues/4175#issuecomment-323023911
function requireDynamically(path: string) {
    // eslint-disable-next-line no-eval
    return eval(`require('${path}');`); // Ensure Webpack does not analyze the require statement
}
