type LinkInfo = [string, [number, number]];

export function findLinks<T extends boolean>(
    content: string,
    withPosition?: T,
): T extends true ? LinkInfo[] : string[] {
    return find(
        /]\(\s*/g,
        content,
        (_, rx) => {
            const link = parseLinkDestination(content, rx.lastIndex);

            if (!link) {
                return undefined;
            }

            rx.lastIndex += link.length + 1;
            return link;
        },
        withPosition,
    );
}

export function findDefs<T extends boolean>(
    content: string,
    withPosition?: T,
): T extends true ? LinkInfo[] : string[] {
    return find(/^\s*\[.*?]:\s*([^\s]+)/gm, content, (match) => match[1], withPosition);
}

function find<T extends boolean>(
    matcher: RegExp,
    content: string,
    map: (match: RegExpMatchArray, rx: RegExp) => string | void,
    withPosition?: T,
): T extends true ? LinkInfo[] : string[] {
    const links = [];

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = matcher.exec(content))) {
        const result = map(match, matcher);
        if (!result) {
            continue;
        }

        // replace is related to parseLinkDestination from markdown-it
        const link = result.replace(/\\/g, '');
        const info = withPosition ? ([link, [match.index, matcher.lastIndex]] as LinkInfo) : link;
        if (link) {
            links.push(info);
        }
    }

    return links as T extends true ? LinkInfo[] : string[];
}

function parseLinkDestination(str: string, start: number) {
    const max = str.length;

    let code,
        level = 0,
        pos = start;

    if (str.charCodeAt(pos) === 0x3c /* < */) {
        return parseSimpleLink(str, start + 1);
    }

    while (pos < max) {
        code = str.charCodeAt(pos);

        if (code === 0x20) {
            break;
        }

        // ascii control characters
        if (code < 0x20 || code === 0x7f) {
            break;
        }

        if (code === 0x5c /* \ */ && pos + 1 < max) {
            if (str.charCodeAt(pos + 1) === 0x20) {
                break;
            }
            pos += 2;
            continue;
        }

        if (code === 0x28 /* ( */) {
            level++;
            if (level > 32) {
                return null;
            }
        }

        if (code === 0x29 /* ) */) {
            if (level === 0) {
                break;
            }
            level--;
        }

        pos++;
    }

    if (start === pos) {
        return null;
    }
    if (level !== 0) {
        return null;
    }

    return str.slice(start, pos);
}

function parseSimpleLink(str: string, start: number) {
    const max = str.length;

    let code,
        pos = start;

    while (pos < max) {
        code = str.charCodeAt(pos);
        if (code === 0x0a /* \n */) {
            return null;
        }
        if (code === 0x3c /* < */) {
            return null;
        }
        if (code === 0x3e /* > */) {
            return str.slice(start, pos);
        }
        if (code === 0x5c /* \ */ && pos + 1 < max) {
            pos += 2;
            continue;
        }

        pos++;
    }

    // no closing '>'
    return null;
}
