import type {
    AudienceFilterResult,
    ContentAudience,
} from '@diplodoc/transform/lib/plugins/visibility';

import {filterAudienceContent} from '@diplodoc/transform/lib/plugins/visibility';

import {INCLUDE_REGEX, findLink} from '~/core/markdown';

const INCLUDED_OPEN_RE = /^\s*{%\s*included\s*\((.+?)\)\s*%}\s*$/;
const INCLUDED_CLOSE_RE = /^\s*{%\s*endincluded\s*%}\s*$/;

type IncludedBlock = {
    key: string;
    content: string;
};

/**
 * Filters audience-specific Markdown without detaching embedded include caches
 * from the visibility scope of the include directive that references them.
 *
 * md2md may append non-inlineable dependencies as `{% included %}` blocks at
 * the end of the page. Filtering the assembled document as one string would
 * leave such a block visible after its include directive was removed with an
 * enclosing visibility block. Filter the page and embedded files separately,
 * then retain only caches reachable from the filtered page.
 */
export function filterCollectedAudienceContent(
    markdown: string,
    audience: ContentAudience,
): AudienceFilterResult {
    const {content, blocks} = extractIncludedBlocks(markdown);
    const filteredRoot = filterAudienceContent(content, audience);

    if (blocks.length === 0) {
        return filteredRoot;
    }

    const blocksByKey = new Map(blocks.map((block) => [block.key, block]));
    const filteredBlocks = new Map<string, AudienceFilterResult>();
    const reachable = new Set<string>();

    const visit = (source: string, parentKey = '') => {
        for (const key of collectIncludeKeys(source, parentKey)) {
            const block = blocksByKey.get(key);
            if (!block || reachable.has(key)) {
                continue;
            }

            reachable.add(key);
            const filtered = filterAudienceContent(block.content, audience);
            filteredBlocks.set(key, filtered);
            visit(filtered.content, key);
        }
    };

    visit(filteredRoot.content);

    const retainedBlocks = blocks.filter(({key}) => reachable.has(key));
    const results = [filteredRoot, ...filteredBlocks.values()];
    const audienceSpecificContent = [
        ...new Set(results.flatMap((result) => result.audienceSpecificContent)),
    ];
    const errors = results.flatMap((result) => result.errors);
    const originalCharacters = Array.from(markdown).length;
    const unchanged =
        filteredRoot.content === content &&
        retainedBlocks.length === blocks.length &&
        retainedBlocks.every((block) => filteredBlocks.get(block.key)?.content === block.content);

    if (unchanged) {
        return {
            content: markdown,
            audienceSpecificContent,
            originalCharacters,
            filteredCharacters: originalCharacters,
            removedCharacters: 0,
            errors,
        };
    }

    const appendix = retainedBlocks
        .map(({key}) => {
            const blockContent = filteredBlocks.get(key)?.content || '';
            return `{% included (${key}) %}\n${blockContent}\n{% endincluded %}`;
        })
        .join('\n');
    const separator = filteredRoot.content.endsWith('\n') ? '' : '\n';
    const filteredContent = appendix
        ? `${filteredRoot.content}${separator}${appendix}`
        : filteredRoot.content;
    const filteredCharacters = Array.from(filteredContent).length;

    return {
        content: filteredContent,
        audienceSpecificContent,
        originalCharacters,
        filteredCharacters,
        removedCharacters: originalCharacters - filteredCharacters,
        errors,
    };
}

function extractIncludedBlocks(markdown: string): {content: string; blocks: IncludedBlock[]} {
    const lines = markdown.split('\n');
    const content: string[] = [];
    const blocks: IncludedBlock[] = [];

    for (let index = 0; index < lines.length; index++) {
        const match = INCLUDED_OPEN_RE.exec(lines[index]);
        if (!match) {
            content.push(lines[index]);
            continue;
        }

        const blockContent: string[] = [];
        let end = index + 1;
        while (end < lines.length && !INCLUDED_CLOSE_RE.test(lines[end])) {
            blockContent.push(lines[end]);
            end++;
        }

        if (end === lines.length) {
            content.push(...lines.slice(index));
            break;
        }

        blocks.push({key: match[1], content: blockContent.join('\n')});
        index = end;
    }

    return {content: content.join('\n'), blocks};
}

function collectIncludeKeys(markdown: string, parentKey: string): string[] {
    const includeRe = new RegExp(INCLUDE_REGEX.source, INCLUDE_REGEX.flags);
    const keys: string[] = [];

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = includeRe.exec(markdown))) {
        const link = findLink(match[0]);
        if (!link) {
            continue;
        }

        const hashIndex = link.indexOf('#');
        const key = hashIndex >= 0 ? link.slice(0, hashIndex) : link;
        keys.push(parentKey ? `${parentKey}:${key}` : key);
    }

    return keys;
}
