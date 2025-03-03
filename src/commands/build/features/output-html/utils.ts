import notes from '@diplodoc/transform/lib/plugins/notes';
import anchors from '@diplodoc/transform/lib/plugins/anchors';
import code from '@diplodoc/transform/lib/plugins/code';
import cut from '@diplodoc/transform/lib/plugins/cut';
import deflist from '@diplodoc/transform/lib/plugins/deflist';
import imsize from '@diplodoc/transform/lib/plugins/imsize';
import meta from '@diplodoc/transform/lib/plugins/meta';
import sup from '@diplodoc/transform/lib/plugins/sup';
import tabs from '@diplodoc/transform/lib/plugins/tabs';
import video from '@diplodoc/transform/lib/plugins/video';
import includes from '@diplodoc/transform/lib/plugins/includes';
import links from '@diplodoc/transform/lib/plugins/links';
import images from '@diplodoc/transform/lib/plugins/images';
import monospace from '@diplodoc/transform/lib/plugins/monospace';
import table from '@diplodoc/transform/lib/plugins/table';
import term from '@diplodoc/transform/lib/plugins/term';
import blockAnchor from '@diplodoc/transform/lib/plugins/block-anchor';
import * as mermaid from '@diplodoc/mermaid-extension';
import * as latex from '@diplodoc/latex-extension';
import * as openapi from '@diplodoc/openapi-extension';

export function getBaseMdItPlugins() {
    return [
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
        blockAnchor,
    ];
}

// TODO(major): Deprecate
export function getCustomMdItPlugins() {
    try {
        const customPlugins = require(require.resolve('./plugins'));
        return Array.isArray(customPlugins) ? customPlugins : [];
    } catch (e) {
        return [];
    }
}
