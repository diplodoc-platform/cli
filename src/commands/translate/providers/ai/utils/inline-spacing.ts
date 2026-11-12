import {compose} from '@diplodoc/translation';
import {isMdAsciiPunct, isPunctChar, isWhiteSpace} from 'markdown-it/lib/common/utils';

const XML_TAG = /<\/?[gx]\b(?:"[^"]*"|'[^']*'|[^'">])*?>/g;
const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
const punctuation = (char: string | undefined) =>
    char !== undefined && (isMdAsciiPunct(char.charCodeAt(0)) || isPunctChar(char));
const whitespace = (char: string | undefined) =>
    char === undefined || isWhiteSpace(char.charCodeAt(0));
const render = (value: string) =>
    String(
        compose('%%%0%%%', [`<source xml:space="preserve">${value}</source>`], {useSource: true}),
    );

interface InlineFrame {
    start: number;
    content: number;
    marker?: string;
    code: boolean;
}

function flanking(marker: string, before: string | undefined, after: string | undefined) {
    const left =
        !whitespace(after) && (!punctuation(after) || whitespace(before) || punctuation(before));
    const right =
        !whitespace(before) && (!punctuation(before) || whitespace(after) || punctuation(after));
    return {
        open: left && (marker[0] !== '_' || !right || punctuation(before)),
        close: right && (marker[0] !== '_' || !left || punctuation(after)),
    };
}

function emphasisMarker(tag: string): string | undefined {
    const type = attr(tag, 'ctype');
    if (type !== 'bold' && type !== 'italic') {
        return undefined;
    }
    return attr(tag, 'x-end') ?? (type === 'bold' ? '**' : '*');
}

function boundarySpaces(
    text: string,
    parent: InlineFrame | undefined,
    closeStart: number,
    closeEnd: number,
): number[] {
    if (!parent || parent.code || !parent.marker || !/^(?:\*{1,3}|_{1,3})$/.test(parent.marker)) {
        return [];
    }
    const content = render(text.slice(parent.content, closeStart));
    if (!content.length) {
        return [];
    }
    // scanDelims in markdown-it classifies adjacent UTF-16 code units.
    const before = text.charAt(parent.start - 1) || undefined;
    const after = text.charAt(closeEnd) || undefined;
    const first = content.charAt(0),
        last = content.charAt(content.length - 1);
    const spaces: number[] = [];
    if (before !== '>' && !whitespace(first) && !flanking(parent.marker, before, first).open) {
        spaces.push(parent.start);
    }
    if (after !== '<' && !whitespace(last) && !flanking(parent.marker, last, after).close) {
        spaces.push(closeEnd);
    }
    return spaces;
}

/** Realize XML emphasis at Markdown boundaries without changing translated words. */
export function repairInlineSpacing(text: string): string {
    try {
        // A formatting repair must never rescue malformed XML.
        render(text);
        const parents: InlineFrame[] = [],
            spaces = new Set<number>();
        for (const match of text.matchAll(XML_TAG)) {
            const tag = match[0],
                index = match.index ?? 0;
            if (tag.startsWith('<g')) {
                parents.push({
                    start: index,
                    content: index + tag.length,
                    marker: emphasisMarker(tag),
                    code: attr(tag, 'ctype') === 'code' || parents.some((p) => p.code),
                });
            } else if (tag.startsWith('</g')) {
                for (const position of boundarySpaces(
                    text,
                    parents.pop(),
                    index,
                    index + tag.length,
                ))
                    {spaces.add(position);}
            }
        }
        if (parents.length) {
            return text;
        }
        let result = text;
        for (const index of [...spaces].sort((a, b) => b - a)) {
            result = result.slice(0, index) + ' ' + result.slice(index);
        }
        return result;
    } catch {
        return text;
    }
}
