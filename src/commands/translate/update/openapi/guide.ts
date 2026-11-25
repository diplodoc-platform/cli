import {
    type Literal,
    type Paragraph,
    type TextEdit,
    changedRange,
    comparisonText,
    composeDescription,
    conflict,
    extractDescription,
    keepsProtections,
    linkDestination,
    protectInline,
    protectedSpans,
    readInline,
    readMarkdown,
    sameStructure,
} from './literal';

const relativeMarkdownHref = /^(?:\.\.?\/)+[^\s]+\.md(?:[?#][^\s]*)?$/i;
// The projection only accepts a standalone bold title and one link per physical list line.
// eslint-disable-next-line no-control-regex
const unsafe = /[\u0000-\u001f\u007f<>]|{%|\{\{|:::|!\[|\]\[/;

type GuideLink = NonNullable<ReturnType<typeof linkDestination>>;
type GuideShape = {marker: string; link: GuideLink; protections: string[]}[];

function parseGuide(blocks: string[]) {
    if (
        blocks.length !== 2 ||
        blocks[0].includes('\n') ||
        !blocks[0].startsWith('**') ||
        !blocks[0].endsWith('**') ||
        unsafe.test(blocks[0])
    ) {
        return undefined;
    }
    const title = readInline(blocks[0], 'render').filter(
        (token) => token.type !== 'text' || token.content,
    );
    if (
        title[0]?.type !== 'strong_open' ||
        title[0].markup !== '**' ||
        title.at(-1)?.type !== 'strong_close' ||
        title.slice(1, -1).some((token) => token.type !== 'text' || token.content.includes('*'))
    ) {
        return undefined;
    }
    const items: GuideShape = [];
    for (const line of blocks[1].split('\n')) {
        const tokens = readMarkdown(line);
        const [list, , , inline] = tokens;
        if (
            tokens.length !== 7 ||
            list.type !== 'bullet_list_open' ||
            inline.type !== 'inline' ||
            line !== list.markup + ' ' + inline.content ||
            !inline.content.startsWith('[') ||
            unsafe.test(line)
        ) {
            return undefined;
        }
        const children = inline.children ?? [];
        const link = linkDestination(children[0]);
        if (
            !link ||
            children[0].attrGet('title') ||
            children.at(-1)?.type !== 'link_close' ||
            children
                .slice(1, -1)
                .some((token) => ['link_open', 'link_close', 'image'].includes(token.type)) ||
            !line.endsWith(`](${link.raw})`) ||
            !/\p{L}/u.test(inline.content.slice(0, -link.raw.length - 3))
        ) {
            return undefined;
        }
        items.push({marker: list.markup, link, protections: protectedSpans(children)});
    }
    return {items, protections: protectedSpans(readInline(blocks[0]))};
}

type LinkStyle = 'protected' | 'plain' | 'mixed';

function recordStyle(previous: LinkStyle | undefined, next: LinkStyle): LinkStyle {
    return previous === undefined || previous === next ? next : 'mixed';
}

export function localGuideLinkProtection(descriptions: readonly string[]) {
    const exact = new Map<string, LinkStyle>();
    let relativeMarkdown: LinkStyle | undefined;
    for (const description of descriptions) {
        for (const token of readMarkdown(description)) {
            if (token.type !== 'inline' || token.content.trimStart().startsWith('{%')) {
                continue;
            }
            for (const child of token.children ?? []) {
                const link = linkDestination(child);
                if (!link) {
                    continue;
                }
                const {url, protectedUrl} = link;
                const style = protectedUrl ? 'protected' : 'plain';
                exact.set(url, recordStyle(exact.get(url), style));
                if (relativeMarkdownHref.test(url)) {
                    relativeMarkdown = recordStyle(relativeMarkdown, style);
                }
            }
        }
    }
    return (url: string) => {
        const style = exact.get(url) ?? (relativeMarkdownHref.test(url) && relativeMarkdown);
        return style === 'protected';
    };
}

function equalGuideLinks(left: GuideShape, right: GuideShape) {
    return (
        left.length === right.length &&
        left.every(
            ({marker, link}, index) =>
                marker === right[index].marker && link.url === right[index].link.url,
        )
    );
}

export type GuideDelta = {
    markdown: string;
    urls: string[];
    apply(translated: string): TextEdit[];
};

export function planLinkedParagraphDeletion(
    oldDescription: Literal,
    newDescription: Literal,
    targetDescription: Literal,
): {url: string; protectedUrl: boolean; edit: TextEdit} | undefined {
    const {first, oldEnd, newEnd} = changedRange(
        oldDescription.paragraphs,
        newDescription.paragraphs,
    );
    if (oldEnd !== first + 1 || newEnd !== first) {
        return undefined;
    }
    return planLinkRemoval(oldDescription.paragraphs[first], undefined, targetDescription);
}

function tailLink(text: string) {
    if (text.includes('\n')) {
        return undefined;
    }
    const links = readInline(text).flatMap((token) => linkDestination(token) ?? []);
    if (links.length !== 1) {
        return undefined;
    }
    const [link] = links;
    const tail = `](${link.raw})`;
    const tailAt = text.lastIndexOf(tail);
    const end = tailAt + tail.length;
    if (tailAt < 0 || !/^[.!?。！？]?\s*$/.test(text.slice(end))) {
        return undefined;
    }
    // MarkdownIt validates the link extent, including bracketed or protected label content.
    for (const {index} of text.slice(0, tailAt).matchAll(/\[/g)) {
        const suffix = readInline(text.slice(index, end));
        if (
            linkDestination(suffix[0])?.raw === link.raw &&
            suffix.at(-1)?.type === 'link_close' &&
            suffix.filter((token) => token.type === 'link_open').length === 1
        ) {
            return {url: link.url, prefix: text.slice(0, index), protectedUrl: link.protectedUrl};
        }
    }
    return undefined;
}

const sentenceEnd = /[.!?。！？][ \t]+/g;
function planLinkRemoval(
    oldBlock: Paragraph,
    retained: Paragraph | undefined,
    target: Literal,
): {url: string; protectedUrl: boolean; edit: TextEdit} | undefined {
    const previous = tailLink(oldBlock.text);
    if (!previous) {
        return undefined;
    }
    const matches = target.paragraphs.flatMap((block, index) => {
        const match = tailLink(block.text);
        return match?.url === previous.url ? [{...match, block, index}] : [];
    });
    if (matches.length !== 1) {
        return conflict('removed link has no unique localized paragraph');
    }
    const [match] = matches;
    const {block, index} = match;
    if (!retained) {
        if (
            [...previous.prefix.matchAll(sentenceEnd)].length ||
            [...match.prefix.matchAll(sentenceEnd)].length ||
            /[{<>`]|:no-translate\[/.test(comparisonText(match.prefix)) ||
            target.paragraphs.length === 1
        ) {
            return conflict('removed linked paragraph contains additional content');
        }
        const next = target.paragraphs[index + 1];
        return {
            url: previous.url,
            protectedUrl: match.protectedUrl,
            edit: {
                from: next ? block.start : target.paragraphs[index - 1].end,
                to: next ? next.start : block.end,
                text: '',
            },
        };
    }
    if (
        !oldBlock.text.startsWith(retained.text) ||
        !/^\s/.test(oldBlock.text[retained.text.length] ?? '')
    ) {
        return undefined;
    }
    let keep: number;
    if (previous.prefix.trimEnd() === retained.text) {
        keep = match.prefix.trimEnd().length;
    } else {
        const sourceSentences = [...previous.prefix.matchAll(sentenceEnd)];
        const targetSentences = [...match.prefix.matchAll(sentenceEnd)];
        if (
            !sourceSentences.length ||
            sourceSentences.at(-1)!.index + 1 !== retained.text.length ||
            sourceSentences.length !== targetSentences.length
        ) {
            return conflict('cannot align the removed linked sentence');
        }
        keep = targetSentences.at(-1)!.index + 1;
    }
    if (!keep || /(?:{%|\{\{|:::|`|:no-translate\[)/.test(match.prefix.slice(keep))) {
        return conflict('cannot remove protected content from the localized link suffix');
    }
    return {
        url: previous.url,
        protectedUrl: match.protectedUrl,
        edit: {
            from: block.start + target.indent.length + keep,
            to: block.end,
            text: '',
        },
    };
}

export function planGuideDelta(
    before: Literal,
    after: Literal,
    target: Literal,
    protect: (url: string) => boolean,
): GuideDelta | undefined {
    const oldBlocks = before.paragraphs;
    const newBlocks = after.paragraphs;
    const targetBlocks = target.paragraphs;
    const candidates = newBlocks.flatMap(({text}, index) => {
        const next = newBlocks[index + 1];
        if (!next || oldBlocks.some((block) => block.text === text)) {
            return [];
        }
        const shape = parseGuide([text, next.text]);
        return shape ? [{index, shape, blocks: [text, next.text]}] : [];
    });
    if (candidates.length !== 1) {
        return undefined;
    }
    const [{index, shape, blocks}] = candidates;
    const withoutGuide = [...newBlocks.slice(0, index), ...newBlocks.slice(index + 2)];
    const {first, oldEnd, newEnd} = changedRange(oldBlocks, withoutGuide);
    const changed = first !== oldEnd || first !== newEnd;
    let removed: ReturnType<typeof planLinkRemoval>;
    if (changed) {
        if (oldEnd !== first + 1 || newEnd > first + 1) {
            return undefined;
        }
        removed = planLinkRemoval(
            oldBlocks[first],
            newEnd > first ? withoutGuide[first] : undefined,
            target,
        );
        if (!removed) {
            return undefined;
        }
    }
    if (
        targetBlocks.some((block, i) => {
            const next = targetBlocks[i + 1];
            const shapeAtTarget = next && parseGuide([block.text, next.text]);
            return shapeAtTarget && equalGuideLinks(shape.items, shapeAtTarget.items);
        })
    ) {
        return conflict('target already contains the inserted guide');
    }

    let at: number;
    let append = false;
    const anchor = withoutGuide[index];
    if (anchor) {
        // Match a single opaque YFM include or directive to handle wrap and layout drift above it.
        if (anchor.prose || !/^\s*{%[^\n]+%}\s*$/.test(anchor.text)) {
            return undefined;
        }
        const matches = (candidate: Paragraph) => sameStructure(anchor, candidate);
        const anchors = targetBlocks.filter(matches);
        if (oldBlocks.filter(matches).length !== 1 || anchors.length !== 1) {
            return conflict('target has no unique guide insertion boundary');
        }
        at = anchors[0].start;
    } else {
        const sourceEnd = oldBlocks.at(-1);
        const targetEnd = targetBlocks.at(-1);
        if (
            !sourceEnd ||
            !targetEnd ||
            sourceEnd.text !== withoutGuide.at(-1)?.text ||
            !sameStructure(sourceEnd, targetEnd) ||
            (sourceEnd.protectedText === '[]' &&
                (oldBlocks.length !== targetBlocks.length ||
                    oldBlocks.some((block, i) => !sameStructure(block, targetBlocks[i]))))
        ) {
            return conflict('target has no matching guide insertion tail');
        }
        at = targetEnd.end;
        append = true;
    }

    return {
        markdown: blocks.join('\n\n'),
        urls: shape.items.map(({link}) => link.url),
        apply(translated) {
            const normalized = translated.replace(/\r\n/g, '\n').trimEnd();
            const realized = parseGuide(normalized.split('\n\n'));
            if (
                !realized ||
                !equalGuideLinks(shape.items, realized.items) ||
                !keepsProtections(shape.protections, realized.protections) ||
                shape.items.some(
                    ({protections}, i) =>
                        !keepsProtections(protections, realized.items[i].protections),
                )
            ) {
                return conflict(
                    'translated guide changes formatting, protected text or link destinations',
                );
            }
            const {skeleton, xliff, warnings} = extractDescription(normalized);
            if (warnings.length || composeDescription(skeleton, xliff) !== normalized) {
                return conflict('translated guide cannot be composed without changes');
            }
            const lines = skeleton.split('\n');
            for (const [index, {link}] of realized.items.entries()) {
                const {url, raw, protectedUrl} = link;
                const moved = removed?.url === url && removed.protectedUrl;
                if (protectedUrl || !(moved || protect(url))) {
                    continue;
                }
                const tail = `](${raw})`;
                const line = lines[index + 2];
                if (!line?.endsWith(tail)) {
                    return conflict('guide destination is absent from skeleton');
                }
                lines[index + 2] = line.slice(0, -tail.length) + `](${protectInline(url)})`;
            }
            const {indent, eol} = target;
            const guide = composeDescription(lines.join('\n'), xliff)
                .split('\n')
                .map((line) => (line ? indent + line : ''))
                .join(eol);
            const gap = eol + eol;
            const insertion = {
                from: at,
                to: at,
                text: append ? gap + guide : guide + gap,
            };
            return removed ? [removed.edit, insertion] : [insertion];
        },
    };
}
