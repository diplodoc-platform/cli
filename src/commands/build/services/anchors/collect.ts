import {unescapeAll} from 'markdown-it/lib/common/utils';

const HTML_TAG = /<(\/?)([A-Za-z][\w:-]*)(?=[\s/>])((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const HTML_ATTRIBUTE = /([^\s=/>]+)(?:\s*=\s*(?:(["'])(.*?)\2|([^\s"'=<>`]+)))?/gs;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);

function getAnchorId(attributes: string) {
    for (const [, attribute, , quoted, unquoted] of attributes.matchAll(HTML_ATTRIBUTE)) {
        if (attribute.toLowerCase() === 'id') {
            return unescapeAll(quoted ?? unquoted ?? '');
        }
    }

    return '';
}

/** Collects IDs from the final HTML, after rendering and optional sanitization. */
export function collectAnchorIds(html: string, anchorIds: Set<string>) {
    let rawTextTag: string | null = null;

    for (const match of html.replace(HTML_COMMENT, '').matchAll(HTML_TAG)) {
        const [, closing, name, attributes] = match;
        const tag = name.toLowerCase();

        if (rawTextTag) {
            if (closing && tag === rawTextTag) {
                rawTextTag = null;
            }
            continue;
        }

        if (closing) {
            continue;
        }

        const id = getAnchorId(attributes);
        if (id) {
            anchorIds.add(id);
        }

        if (RAW_TEXT_TAGS.has(tag) && !attributes.trimEnd().endsWith('/')) {
            rawTextTag = tag;
        }
    }
}
