import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';
import type {Logger} from '~/core/logger';
import {prettifyLink, walkLinks} from '../utils';
import {isExternalHref} from '~/core/utils';


type Options = {
    path: NormalizedPath;
    log: Logger;
    titles: Record<NormalizedPath, Hash<string>>;
    entries: NormalizedPath[];
    existsInProject: (path: NormalizedPath) => boolean;
};

export default ((md) => {
    const plugin = (state: StateCore) => {
        walkLinks(state, (link, href) => {
            if (isExternalHref(href)) return;
            
            const newHref = prettifyLink(href);
            
            link.attrSet('href', newHref);
        });
    };

    try {
        md.core.ruler.before('includes', 'skipHtmlLinks', plugin);
    } catch (e) {
        md.core.ruler.push('skipHtmlLinks', plugin);
    }
}) as MarkdownItPluginCb<Options>;
