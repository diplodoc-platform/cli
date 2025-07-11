import type {Run as BaseRun} from '@diplodoc/cli/lib/run';
import type {BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {MarkdownService, Plugin} from '@diplodoc/cli/lib/markdown';

import {join} from 'node:path';
import {getHooks as getBaseHooks} from '@diplodoc/cli/lib/program';
import {getHooks as getMarkdownHooks} from '@diplodoc/cli/lib/markdown';

type PluginConfigInput = {
    name: string;
    plugins: (string | NormalizedPlugin)[];
};

type NormalizedPlugin = {
    name: string;
    exportName?: string;
    options?: Hash;
    resolver?: string;
};

type Run = BaseRun & {
    markdown?: MarkdownService;
};

function isRelative(path: string) {
    return /^\.{1,2}\//.test(path || '');
}

export class Extension implements IExtension {
    private plugins: NormalizedPlugin[];

    constructor(config: PluginConfigInput) {
        this.plugins = config.plugins.map((plugin) => {
            if (typeof plugin === 'string') {
                return {name: plugin};
            }

            return plugin;
        });
    }

    apply(program: BaseProgram) {
        getBaseHooks<Run>(program).BeforeAnyRun.tap('MarkdownItPlugins', (run) => {
            getMarkdownHooks(run.markdown).Plugins.tap('MarkdownItPlugins', (plugins) => {
                for (const pluginConfig of this.plugins) {
                    const {name, exportName = 'default', options = {}, resolver} = pluginConfig;

                    let pluginResolver: Plugin;

                    if (resolver && isRelative(resolver)) {
                        pluginResolver = require(join(run.originalInput, resolver));
                    } else {
                        pluginResolver = (md, pluginOptions) => {
                            const pluginModule = require(name);

                            if (typeof pluginModule === 'function') {
                                return pluginModule(md, pluginOptions);
                            }

                            return pluginModule[exportName](md, pluginOptions);
                        };
                    }

                    plugins.push((md) => pluginResolver(md, options));
                }

                return plugins;
            });
        });
    }
}
