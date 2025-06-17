import type {Run as BaseRun} from '@diplodoc/cli/lib/run';
import type {BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {MarkdownService} from '@diplodoc/cli/lib/markdown';

import {omit} from 'lodash';
import {getHooks as getBaseHooks} from '@diplodoc/cli/lib/program';
import {getHooks as getMarkdownHooks} from '@diplodoc/cli/lib/markdown';

type PluginConfigInput = {
    name: string;
    plugins: (string | NormalizedPlugin)[];
};

type NormalizedPlugin = {
    name: string;
} & Hash;

type Run = BaseRun & {
    markdown?: MarkdownService;
};

export class MarkdownItPluginsExtension implements IExtension {
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
                    const plugin = require(pluginConfig.name);
                    const options = omit(pluginConfig, ['name']);

                    plugins.push((globals) => plugin(options, globals));
                }

                return plugins;
            });
        });
    }
}
