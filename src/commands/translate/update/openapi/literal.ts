import {compose, extract, noTranslate} from '@diplodoc/translation';
import MarkdownIt from 'markdown-it';
import {type Scalar, isScalar} from 'yaml';

export type Paragraph = {
    start: number;
    end: number;
    text: string;
    protectedText: string;
    prose: boolean;
};

export type Literal = {
    from: number;
    to: number;
    header: string;
    raw: string;
    indent: string;
    eol: string;
    value: string;
    paragraphs: Paragraph[];
};

export type TextEdit = {from: number; to: number; text: string};
const markdown = new MarkdownIt({html: true}).use(noTranslate({mode: 'translate'}));
const renderedMarkdown = new MarkdownIt({html: true}).use(noTranslate({mode: 'render'}));
// Compare links as written in the YAML. HTML percent encoding would hide wrappers.
markdown.normalizeLink = (url) => url;

export function readMarkdown(text: string) {
    return markdown.parse(text, {});
}

export function readInline(text: string, mode: 'translate' | 'render' = 'translate') {
    const parser = mode === 'translate' ? markdown : renderedMarkdown;
    return parser.parseInline(text, {})[0].children ?? [];
}

export function extractDescription(text: string, compact = true) {
    return extract.md(text, {
        // This extraction is used for syntax checks and source composition.
        source: {language: 'en', locale: 'US'},
        target: {language: 'en', locale: 'US'},
        compact,
        unitLocalIds: true,
    });
}

export function composeDescription(skeleton: string, xliff: string) {
    return compose.md(skeleton, xliff, {useSource: true});
}

export function protectInline(text: string) {
    return `:no-translate[${text}]`;
}

function protectedBody(token: MarkdownIt.Token) {
    return token.type === 'no_translate_inline' ? (token.attrGet('data-content') ?? '') : undefined;
}

export function linkDestination(token?: MarkdownIt.Token) {
    const raw = token?.type === 'link_open' ? token.attrGet('href') : null;
    if (!raw) {
        return undefined;
    }
    const [wrapped, ...rest] = raw.startsWith(':no-translate[') ? readInline(raw) : [];
    const value = wrapped && protectedBody(wrapped);
    if (value !== undefined && !rest.length && protectInline(value) === raw) {
        return {raw, url: value, protectedUrl: true};
    }
    return {raw, url: raw, protectedUrl: false};
}

export function protectedSpans(tokens: readonly MarkdownIt.Token[]) {
    return tokens.flatMap((token) => {
        const value = protectedBody(token);
        if (value !== undefined) {
            return [protectInline(value)];
        }
        const link = linkDestination(token);
        return link?.protectedUrl ? [link.raw] : [];
    });
}

export function keepsProtections(source: readonly string[], target: readonly string[]) {
    const counts = new Map<string, number>();
    for (const span of target) {
        counts.set(span, (counts.get(span) ?? 0) + 1);
    }
    return source.every((span) => {
        const count = counts.get(span) ?? 0;
        counts.set(span, count - 1);
        return count > 0;
    });
}

function codeSpan(token: MarkdownIt.Token) {
    return token.markup + token.content + token.markup;
}

function structure(tokens: readonly MarkdownIt.Token[]): string[] {
    return tokens.flatMap((token) => {
        if (token.type === 'code_inline') {
            return [codeSpan(token)];
        }
        const link = linkDestination(token);
        if (link) {
            return [`](${link.url})`];
        }
        const body = protectedBody(token);
        return body === undefined ? [] : structure(readInline(body));
    });
}

function unwrapInlineProtection(text: string) {
    return protectedSpans(readInline(text)).reduce(
        (value, span) => value.split(span).join(span.slice(':no-translate['.length, -1)),
        text,
    );
}

export function comparisonText(text: string) {
    return unwrapInlineProtection(text).replace(/\s+/g, ' ').trim();
}

// Native XLIFF preserves the bytes around inline code that MarkdownIt normalizes.
const codePlaceholders =
    /(<x ctype="code_open" equiv-text=")([^"]*)("[^>]*>)([^<]*)(<x ctype="code_close" equiv-text=")([^"]*)("[^>]*>)/g;

function exactCodeBytes(text: string) {
    const {units} = extractDescription(unwrapInlineProtection(text), false);
    return units.flatMap((unit) =>
        [...unit.matchAll(codePlaceholders)].map(
            ([, , left, , inside, , right]) => left + inside + right,
        ),
    );
}

export function preserveTargetProtections(translated: string, previous: string): string {
    const protectedCode = new Set(
        readInline(previous).flatMap((token) => {
            const body = protectedBody(token);
            if (!body) {
                return [];
            }
            const [code, ...rest] = readInline(body);
            return code?.type === 'code_inline' && !rest.length
                ? [markdown.utils.escapeHtml(body)]
                : [];
        }),
    );
    if (!protectedCode.size) {
        return translated;
    }
    const {skeleton, xliff, warnings} = extractDescription(translated);
    if (warnings.length || composeDescription(skeleton, xliff) !== translated) {
        return conflict('translated paragraph cannot preserve target code protection');
    }
    // Inline code in native translation units has paired code_open/code_close placeholders.
    // Keep their existing escape sequences and add the directive to their rendered text.
    const protectedXliff = xliff.replace(
        codePlaceholders,
        (markup, openTag, open, openEnd, code, closeTag, close, closeEnd) =>
            protectedCode.has(open + code + close)
                ? openTag +
                  ':no-translate[' +
                  open +
                  openEnd +
                  code +
                  closeTag +
                  close +
                  ']' +
                  closeEnd
                : markup,
    );
    return composeDescription(skeleton, protectedXliff);
}

export function conflict(reason: string): never {
    throw new Error(`Cannot project changed OpenAPI description: ${reason}`);
}

export function literalScalar(
    node: unknown,
): (Scalar<string> & {range: [number, number, number]}) | undefined {
    if (
        !isScalar(node) ||
        typeof node.value !== 'string' ||
        node.type !== 'BLOCK_LITERAL' ||
        node.anchor ||
        node.tag ||
        !node.range
    ) {
        return undefined;
    }
    return node as Scalar<string> & {range: [number, number, number]};
}

export function paragraph(text: string, start: number, end: number): Paragraph {
    const blocks = readMarkdown(text);
    // A standalone directive stays opaque, even if it contains an include link.
    const directive =
        blocks[0]?.type === 'no_translate_skip' ? text.split('\n').slice(1, -1).join('\n') : text;
    if (/^\s*{%[^\n]+%}$/.test(directive)) {
        return {start, end, text, protectedText: directive, prose: false};
    }
    const inline = blocks.flatMap((token) => token.children ?? []);
    const body = inline
        .map((token) => (token.type === 'text' ? token.content : (protectedBody(token) ?? '')))
        .join(' ');
    const prose =
        blocks.length === 3 &&
        blocks[0].type === 'paragraph_open' &&
        /\p{L}/u.test(body) &&
        ![...text].some((character) => {
            const point = character.codePointAt(0)!;
            return (point < 32 && character !== '\n' && character !== '\t') || point === 127;
        }) &&
        !text
            .split('\n')
            .some((line) =>
                /^(?:\s|[#><|]|[-+*](?:\s|$)|\d+[.)](?:\s|$)|[-=_*]{3,}(?:\s|$)|[=-]+[ \t]*$|`{3,}|~{3,}|::|{%|\[.*\]:)/.test(
                    line,
                ),
            ) &&
        inline.every(
            (token) => !['image', 'html_inline'].includes(token.type) && !token.attrGet('title'),
        ) &&
        !/(?:{%|\{\{|\{#|:::|:no-translate\[|\]\(|\]\[|<\/?[A-Za-z!]|%%%\d+%%%|`)/.test(
            inline
                .filter((token) => token.type === 'text')
                .map((token) => token.content)
                .join(' '),
        );
    const signature = structure(inline);
    if (prose && signature.some((part) => part.startsWith('`'))) {
        signature.push(...exactCodeBytes(text));
    }
    return {start, end, text, protectedText: JSON.stringify(signature), prose};
}

export function readParagraphs(text: string, indent = '', offset = 0): Paragraph[] {
    const blocks: Paragraph[] = [];
    let lines: string[] = [];
    let start = 0;
    let end = 0;
    const flush = () => {
        if (lines.length) {
            blocks.push(paragraph(lines.join('\n'), start, end));
        }
        lines = [];
    };
    for (const line of text.matchAll(/([^\r\n]*)(?:\r\n|\n|$)/g)) {
        if (!line[0]) {
            continue;
        }
        if (!line[1].trim()) {
            flush();
            continue;
        }
        if (!line[1].startsWith(indent)) {
            conflict('nonuniform literal indentation');
        }
        if (!lines.length) {
            start = offset + line.index;
        }
        end = offset + line.index + line[1].length;
        lines.push(line[1].slice(indent.length));
    }
    flush();
    return blocks;
}

export function readLiteral(text: string, node: unknown): Literal {
    const scalar = literalScalar(node) ?? conflict('expected a literal description');
    const [from, to] = scalar.range;
    const raw = text.slice(from, to);
    const header = raw.match(/^\|(?:[1-9][+-]?|[+-][1-9]?)?(?:[ \t]+(?:#.*)?)?(\r\n|\n)/);
    if (!header) {
        return conflict('invalid literal header');
    }
    const body = raw.slice(header[0].length);
    const lines = body.split(/\r\n|\n/);
    let indentLength = Infinity;
    for (const line of lines) {
        if (line.trim()) {
            indentLength = Math.min(indentLength, line.search(/[^ ]/));
        }
    }
    if (!Number.isFinite(indentLength) || !indentLength) {
        conflict('empty literal description');
    }
    const physicalValue = lines.map((line) => line.slice(indentLength)).join('\n');
    const value = scalar.value;
    if (physicalValue.replace(/\n+$/, '') !== value.replace(/\n+$/, '')) {
        conflict('literal indentation does not match YAML');
    }
    const indent = ' '.repeat(indentLength);
    return {
        from,
        to,
        header: header[0],
        raw,
        indent,
        eol: header[1],
        value,
        paragraphs: readParagraphs(body, indent, from + header[0].length),
    };
}

export function sameStructure(left: Paragraph, right: Paragraph) {
    return (
        left.prose === right.prose &&
        left.protectedText === right.protectedText &&
        (left.prose || /^\s*{%[^\n]+%}$/.test(left.protectedText) || left.text === right.text)
    );
}

export function changedRange(before: Paragraph[], after: Paragraph[]) {
    let first = 0;
    let oldEnd = before.length;
    let newEnd = after.length;
    while (first < oldEnd && first < newEnd && before[first].text === after[first].text) {
        first++;
    }
    while (first < oldEnd && first < newEnd && before[oldEnd - 1].text === after[newEnd - 1].text) {
        oldEnd--;
        newEnd--;
    }
    return {first, oldEnd, newEnd};
}
