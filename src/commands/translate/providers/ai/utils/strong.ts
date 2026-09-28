type MarkupRepair = {
    text: string;
    stripped: number;
};

type StrongDelimiter = {
    index: number;
    canOpen: boolean;
    canClose: boolean;
};

const WHITESPACE = /\s/u;
const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
const UNICODE_PUNCTUATION = /\p{P}/u;

function isPunctuation(char: string | undefined): boolean {
    return char !== undefined && (ASCII_PUNCTUATION.test(char) || UNICODE_PUNCTUATION.test(char));
}

function isEscaped(text: string, index: number): boolean {
    let slashes = 0;

    for (let at = index - 1; at >= 0 && text[at] === '\\'; at--) {
        slashes++;
    }

    return slashes % 2 === 1;
}

/** End of a matching inline-code span, or the end of its unmatched opening run. */
function codeSpanEnd(text: string, start: number): number {
    let openingEnd = start;

    while (text[openingEnd] === '`') {
        openingEnd++;
    }

    const width = openingEnd - start;
    let candidate = openingEnd;

    while ((candidate = text.indexOf('`', candidate)) >= 0) {
        let closingEnd = candidate;

        while (text[closingEnd] === '`') {
            closingEnd++;
        }

        if (closingEnd - candidate === width) {
            return closingEnd;
        }

        candidate = closingEnd;
    }

    return openingEnd;
}

function opaqueEnd(text: string, index: number): number | undefined {
    if (text[index] === '<') {
        const end = text.indexOf('>', index + 1);

        return end < 0 ? undefined : end + 1;
    }

    return text[index] === '`' && !isEscaped(text, index) ? codeSpanEnd(text, index) : undefined;
}

function delimiterFlanking(text: string, index: number) {
    const before = text[index - 1];
    const after = text[index + 2];
    const beforeWhitespace = before === undefined || WHITESPACE.test(before);
    const afterWhitespace = after === undefined || WHITESPACE.test(after);
    const beforePunctuation = isPunctuation(before);
    const afterPunctuation = isPunctuation(after);

    return {
        beforePunctuation,
        afterPunctuation,
        left: !afterWhitespace && (!afterPunctuation || beforeWhitespace || beforePunctuation),
        right: !beforeWhitespace && (!beforePunctuation || afterWhitespace || afterPunctuation),
    };
}

function strongDelimiter(
    text: string,
    index: number,
    marker: '*' | '_',
): StrongDelimiter | undefined {
    if (
        text.slice(index, index + 2) !== marker.repeat(2) ||
        text[index - 1] === marker ||
        text[index + 2] === marker ||
        isEscaped(text, index)
    ) {
        return undefined;
    }

    const {left, right, beforePunctuation, afterPunctuation} = delimiterFlanking(text, index);

    return {
        index,
        canOpen: left && (marker === '*' || !right || beforePunctuation),
        canClose: right && (marker === '*' || !left || afterPunctuation),
    };
}

function strongDelimiters(text: string, marker: '*' | '_'): StrongDelimiter[] {
    const delimiters: StrongDelimiter[] = [];

    for (let index = 0; index < text.length; index++) {
        const end = opaqueEnd(text, index);

        if (end) {
            index = end - 1;
        } else {
            const delimiter = strongDelimiter(text, index, marker);

            if (delimiter) {
                delimiters.push(delimiter);
                index++;
            }
        }
    }

    return delimiters;
}

/** Removes only balanced strong delimiter runs outside code and tags. */
function stripStrongPairs(text: string, marker: '*' | '_'): MarkupRepair {
    const open: StrongDelimiter[] = [];
    const stripped = new Set<number>();

    for (const delimiter of strongDelimiters(text, marker)) {
        if (delimiter.canClose && open.length) {
            const opener = open.pop();

            if (opener) {
                stripped.add(opener.index);
                stripped.add(delimiter.index);
            }
        } else if (delimiter.canOpen) {
            open.push(delimiter);
        }
    }

    let repaired = '';

    for (let index = 0; index < text.length; index++) {
        if (stripped.has(index)) {
            index++;
        } else {
            repaired += text[index];
        }
    }

    return {
        text: repaired,
        stripped: stripped.size,
    };
}

/**
 * Removes strong emphasis the model invents inside a fragment which had no
 * strong emphasis of that flavour. Unlike an edge wrapping, this can sit
 * around only the label of a sentence or list item.
 */
export function stripInventedStrong(
    source: string,
    translation: string,
    expected: ReadonlyMap<string, number>,
): MarkupRepair {
    // Literal markers can be the model's replacement for a dropped inline
    // tag (a link, for example), so only plain source fragments are safe.
    if (/<[^>]+>/.test(source)) {
        return {text: translation, stripped: 0};
    }

    let text = translation;
    let stripped = 0;
    const pairs = [
        {run: '**', marker: '*'},
        {run: '__', marker: '_'},
    ] as const;

    for (const {run, marker} of pairs) {
        if (expected.has(run)) {
            continue;
        }

        const repair = stripStrongPairs(text, marker);
        text = repair.text;
        stripped += repair.stripped;
    }

    return {text, stripped};
}
