import type {Toc, TocItem} from './types';

import {dirname, join} from 'node:path';

import {normalizePath} from '~/core/utils';

import {isEntryItem} from './utils';

/** Resolves page audiences once per TOC graph, rejecting ambiguous page references. */
export function collectPageAudiences(tocs: Toc[]): ReadonlyMap<NormalizedPath, 'agent' | 'common'> {
    const audiences = new Map<NormalizedPath, 'agent' | 'common'>();

    for (const toc of tocs) {
        const visit = (item: Toc | TocItem, inheritedAgent: boolean) => {
            const agentOnly = inheritedAgent || item.visibility === 'agent';
            if (agentOnly) {
                item.visibility = 'agent';
            }

            if (isEntryItem(item)) {
                const path = normalizePath(join(dirname(toc.path), item.href));
                const audience = agentOnly ? 'agent' : 'common';
                const previous = audiences.get(path);
                if (previous && previous !== audience) {
                    throw new Error(
                        `Conflicting visibility for ${path}: common and agent TOC references.`,
                    );
                }
                audiences.set(path, audience);
            }

            item.items?.forEach((child) => visit(child, agentOnly));
        };

        visit(toc, false);
    }

    return audiences;
}
