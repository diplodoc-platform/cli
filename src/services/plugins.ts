import {LintConfig, LintRule} from '@diplodoc/transform/lib/yfmlint';

import {Plugin, PluginOptions} from '../models';
import meta from '@diplodoc/transform/lib/plugins/meta';
import deflist from '@diplodoc/transform/lib/plugins/deflist';
import includes from '@diplodoc/transform/lib/plugins/includes';
import cut from '@diplodoc/transform/lib/plugins/cut';
import links from '@diplodoc/transform/lib/plugins/links';
import images from '@diplodoc/transform/lib/plugins/images';
import notes from '@diplodoc/transform/lib/plugins/notes';
import anchors from '@diplodoc/transform/lib/plugins/anchors';
import tabs from '@diplodoc/transform/lib/plugins/tabs';
import code from '@diplodoc/transform/lib/plugins/code';
import imsize from '@diplodoc/transform/lib/plugins/imsize';
import sup from '@diplodoc/transform/lib/plugins/sup';
import video from '@diplodoc/transform/lib/plugins/video';
import monospace from '@diplodoc/transform/lib/plugins/monospace';
import table from '@diplodoc/transform/lib/plugins/table';
import term from '@diplodoc/transform/lib/plugins/term';
import changelog from '@diplodoc/transform/lib/plugins/changelog';
import blockAnchor from '@diplodoc/transform/lib/plugins/block-anchor';
import * as mermaid from '@diplodoc/mermaid-extension';
import * as latex from '@diplodoc/latex-extension';
import * as openapi from '@diplodoc/openapi-extension';

let plugins: Function[] | Plugin[];

export const YFM_PLUGINS = [
    meta,
    deflist,
    includes,
    cut,
    links,
    images,
    notes,
    anchors,
    tabs,
    code,
    imsize,
    sup,
    video,
    monospace,
    table,
    term,
    openapi.transform(),
    mermaid.transform({
        bundle: false,
        runtime: '_bundle/mermaid-extension.js',
    }),
    latex.transform({
        bundle: false,
        runtime: {
            script: '_bundle/latex-extension.js',
            style: '_bundle/latex-extension.css',
        },
    }),
    changelog,
    blockAnchor,
];

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
