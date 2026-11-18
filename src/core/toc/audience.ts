import type {PageAudience, Toc, TocItem} from './types';

import {dirname, join} from 'node:path';

import {normalizePath} from '~/core/utils';

import {isEntryItem} from './utils';

/** A conflicting TOC edit can be corrected by a later watch event. */
export class PageAudienceConflictError extends Error {}

type TocPosition = string | {parent: TocPosition; index: number};

function formatPosition(position: TocPosition): string {
    const segments: string[] = [];
    while (typeof position !== 'string') {
        segments.push(`.items[${position.index}]`);
        position = position.parent;
    }
    segments.reverse();
    return position + segments.join('');
}

/** Writes inherited visibility onto resolved TOC items and indexes their page audiences. */
export function applyPageAudiences(tocs: Toc[]): ReadonlyMap<NormalizedPath, PageAudience> {
    const audiences = new Map<NormalizedPath, PageAudience>();
    const firstReferences = new Map<NormalizedPath, TocPosition>();

    for (const toc of tocs) {
        const visit = (item: Toc | TocItem, inheritedAgent: boolean, position: TocPosition) => {
            const agentOnly = inheritedAgent || item.visibility === 'agent';
            if (agentOnly) {
                item.visibility = 'agent';
            }

            if (isEntryItem(item)) {
                const path = normalizePath(join(dirname(toc.path), item.href));
                const audience = agentOnly ? 'agent' : 'common';
                const first = firstReferences.get(path);
                if (first === undefined) {
                    audiences.set(path, audience);
                    firstReferences.set(path, position);
                } else if (audiences.get(path) !== audience) {
                    throw new PageAudienceConflictError(
                        `Conflicting visibility for ${path} in resolved TOCs: ` +
                            `${audiences.get(path)} at ${formatPosition(first)} and ` +
                            `${audience} at ${formatPosition(position)}.`,
                    );
                }
            }

            item.items?.forEach((child, index) =>
                visit(child, agentOnly, {parent: position, index}),
            );
        };

        visit(toc, false, toc.path);
    }

    return audiences;
}
