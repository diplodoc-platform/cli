import {
    EOL,
    BLOCK,
    HTML_COMMENTS_OPEN_DIRECTIVE,
    HTML_COMMENTS_CLOSE_DIRECTIVE,
    DISABLE_LINTER_DIRECTIVE,
} from '../constants';


import {TitleDepth} from '../types';

function meta(content: (string | boolean | undefined)[]) {
    const entries = content.filter(Boolean);

    if (!entries.length) {
        return [];
    }

    return EOL + ['---', ...content.filter(Boolean), '---'].join(EOL) + EOL;
}

function list(items: string[]) {
    return items.map((item) => `- ${item}`).join(EOL) + EOL;
}

function link(text: string, src: string) {
    return `[${text}](${src})`;
}

function title(depth: TitleDepth) {
    return (content?: string) => content?.length && '#'.repeat(depth) + ` ${content}`;
}

function body(text?: string) {
    return text?.length && text;
}

function mono(text: string) {
    return `##${text}##`;
}

function bold(text: string) {
    return `**${text}**`;
}

function code(text: string) {
    return EOL + ['```', text, '```'].join(EOL) + EOL;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function table(data: any[][]) {
    const [names, ...rest] = data;

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const colgen = (col: any) => (Array.isArray(col) ? `${EOL}${table(col)}${EOL}` : escapeTableColContent(` ${col} `));
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const rowgen = (row: any) => `||${row.map(colgen).join('|')}||`;

    return `#|${block([names.map(bold), ...rest].map(rowgen))}|#`;
}

function cut(text: string, heading = '') {
    return block([`{% cut "${heading}" %}`, text, '{% endcut %}']) + EOL;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function block(elements: any[]) {
    return elements.filter(Boolean).join(BLOCK);
}

// https://stackoverflow.com/a/49834158
function escapeTableColContent(cellContent: string) {
    return cellContent.replace(/\|/gi, '<code>&#124;</code>');
}

function page(content: string) {
    return `${content}\n${HTML_COMMENTS_OPEN_DIRECTIVE} ${DISABLE_LINTER_DIRECTIVE} ${HTML_COMMENTS_CLOSE_DIRECTIVE}`;
}

function tabs(tabsObj: Record<string, string>) {
    return block([
        '{% list tabs %}',
        Object.entries(tabsObj).map(([tabTitle, value]) => `- ${tabTitle}

  ${value.replace(/\n/g, '\n  ')}
        `).join('\n\n'),
        '{% endlist %}\n',
    ]);
}

export {meta, list, link, title, body, mono, bold, table, code, cut, block, page, tabs};

export default {meta, list, link, title, body, mono, bold, table, code, cut, block, tabs};
