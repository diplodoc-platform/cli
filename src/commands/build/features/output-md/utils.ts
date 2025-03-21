import type {Collect} from '~/core/markdown';

import * as mermaid from '@diplodoc/mermaid-extension';
import * as latex from '@diplodoc/latex-extension';

type Plugin = {
    collect?: Collect;
};

// TODO(major): Deprecate
export function getCustomCollectPlugins(): Collect[] {
    try {
        const plugins: Plugin[] = require(require.resolve('./plugins'));

        const collects = (
            [
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
            ] as Plugin[]
        )
            .concat(plugins || [])
            .map((plugin) => plugin.collect);

        return collects.filter(Boolean) as Collect[];
    } catch (e) {
        return [];
    }
}
