import {PluginOptions, Plugin, CollectionOfPluginsFunction} from '../models';
import {YFM_PLUGINS} from '../constants';

export default class YfmPlugin {
    static plugins: any[];
    static collectionOfPlugins: CollectionOfPluginsFunction;

    constructor() {
        YfmPlugin.plugins = this.getPlugins();
        YfmPlugin.collectionOfPlugins = this.makeCollectOfPlugins();
    }

    makeCollectOfPlugins(): CollectionOfPluginsFunction {
        const pluginsWithCollect = YfmPlugin.plugins.filter((plugin: Plugin) => {
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

    getPlugins() {
        const customPlugins = this.getCustomPlugins();

        return [...YFM_PLUGINS, ...customPlugins];
    }

    getCustomPlugins() {
        try {
            return this.requireDynamically('./plugins');
        } catch (e) {
            return [];
        }
    }

    // https://github.com/webpack/webpack/issues/4175#issuecomment-323023911
    requireDynamically(path: string) {
        return eval(`require('${path}');`); // Ensure Webpack does not analyze the require statement
    }
}
