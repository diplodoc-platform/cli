import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';

import {getHref, walkLinks} from '../utils';

type Options = {
    path: NormalizedPath;
};

export default ((md) => {
    const plugin = (state: StateCore) => {
        walkLinks(state, (link, href) => {
            link.attrSet('href', getHref(href));
        });
    };

    try {
        md.core.ruler.after('anchors', 'skipHtmlLinks', plugin);
    } catch (e) {
        md.core.ruler.push('skipHtmlLinks', plugin);
    }
}) as MarkdownItPluginCb<Options>;
