import {
    EOL,
    BLOCK,
    HTML_COMMENTS_OPEN_DIRECTIVE,
    HTML_COMMENTS_CLOSE_DIRECTIVE,
    DISABLE_LINTER_DIRECTIVE,
} from '../constants';


import {TitleDepth} from '../types';

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

function code(text: string) {
    return EOL + ['```', text, '```'].join(EOL) + EOL;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function table(data: any[][]) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const colgen = (col: any) => (Array.isArray(col) ? `${EOL}${table(col)}${EOL}` : escapeTableColContent(` ${col} `));
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const rowgen = (row: any) => `||${row.map(colgen).join('|')}||`;

    return `#|${block(data.map(rowgen))}|#`;
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
    return `${HTML_COMMENTS_OPEN_DIRECTIVE} ${DISABLE_LINTER_DIRECTIVE} ${HTML_COMMENTS_CLOSE_DIRECTIVE}\n${content}`;
}

export {list, link, title, body, mono, table, code, cut, block, page};

export default {list, link, title, body, mono, table, code, cut, block};
