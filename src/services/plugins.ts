import {LintConfig, LintRule} from '@diplodoc/transform/lib/yfmlint';

import {Plugin, PluginOptions} from '../models';
import {YFM_PLUGINS} from '../constants';

let plugins: Function[] | Plugin[];

export function setPlugins(): void {
    plugins = getAllPlugins();
}

export function getPlugins() {
    return plugins;
}

type CollectionOfPluginsFunction = (output: string, options: PluginOptions) => string;

export function getCollectOfPlugins(): CollectionOfPluginsFunction {
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
