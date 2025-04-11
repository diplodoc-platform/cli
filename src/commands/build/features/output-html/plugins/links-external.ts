import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';
import type {Logger} from '~/core/logger';

import {isExternalHref} from '~/core/utils';

import {walkLinks} from '../utils';

type Options = {
    path: NormalizedPath;
    log: Logger;
    titles: Record<NormalizedPath, Hash<string>>;
};

export default ((md) => {
    const plugin = (state: StateCore) => {
        walkLinks(state, (link, href) => {
            if (isExternalHref(href)) {
                link.attrSet('target', '_blank');
                link.attrSet('rel', 'noreferrer noopener');
            }
        });
    };

    try {
        md.core.ruler.before('links', 'links-external', plugin);
    } catch (e) {
        md.core.ruler.push('links-external', plugin);
    }
}) as MarkdownItPluginCb<Options>;
