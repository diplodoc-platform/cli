import type {Location} from '../types';
import type {LoaderContext} from '../loader';

import {filterRanges} from '../utils';

export function resolveHeadings(this: LoaderContext, content: string) {
    const headings = [];
    const exclude = [...this.api.comments.get()];

    const heading = /(?<=^|\n)([#=-])/g;

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = heading.exec(content))) {
        const [result, location] =
            match[1] === '#'
                ? findCommonHeading(match.index, content)
                : findAlternateHeading(match.index, content);

        if (result) {
            headings.push({content: result, location});
            heading.lastIndex = location[1];
        }
    }

    this.api.headings.set(filterRanges(exclude, headings));

    return content;
}

const SPACE = /[ \t]/;

function findCommonHeading(start: number, content: string): [string, Location] | never[] {
    let title = '';

    let index = start;
    while (index < content.length) {
        if (index - start > 6) {
            return [];
        }

        if (content[index] === '#') {
            index++;
        } else if (content[index].match(SPACE)) {
            break;
        } else {
            return [];
        }
    }

    while (index < content.length) {
        if (content[index + 1] && content[index] !== '\n') {
            title += content[index];
            index++;
        } else if (title.trim()) {
            return [content.slice(start, index), [start, index]];
        } else {
            return [];
        }
    }

    return [];
}

function findAlternateHeading(start: number, content: string): [string, Location] | never[] {
    const delim = content[start];
    const newline = [];

    let title = '';

    let end = start;
    while (end < content.length) {
        if (content[end] === delim) {
            end++;
        } else if (content[end] === '\n' || !content[end + 1]) {
            break;
        } else {
            return [];
        }
    }

    let index = start - 1;
    while (index >= 0) {
        const isContentStart = !index;
        const isTitleStart = newline.length === 2 && !content.slice(...newline).trim();

        if (newline.length && !isTitleStart) {
            newline.length = 1;
        }

        if (!isTitleStart) {
            title = content[index] + title;
        }

        if (isContentStart || isTitleStart) {
            const clean = title.trimStart();
            if (clean) {
                return [content.slice(start - clean.length, end), [start - clean.length, end]];
            } else {
                return [];
            }
        }

        if (content[index] === '\n') {
            newline.unshift(index);
        }

        index--;
    }

    return [];
}
