import type {StateCore} from '~/core/markdown/parser';
import type {MarkdownItPluginCb} from '@diplodoc/transform/types';

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
    } catch {
        md.core.ruler.push('skipHtmlLinks', plugin);
    }
}) as MarkdownItPluginCb<Options>;
