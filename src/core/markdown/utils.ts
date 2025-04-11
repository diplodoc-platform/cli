import type {Location} from './types';

type LinkInfo = {link: string; location: Location};

export function findLinks<T extends boolean>(
    content: string,
    withPosition?: T,
): T extends true ? LinkInfo[] : string[] {
    return find(
        /]\(\s*/g,
        content,
        (_, rx) => {
            const link = parseLinkDestination(content, rx.lastIndex);

            // TODO: add more precise filter for unix compatible paths
            if (!link || link.match(/[${}]/)) {
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
        const location = [match.index, matcher.lastIndex];
        const info = withPosition ? ({link, location} as LinkInfo) : link;
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

export function filterRanges<T extends {location: Location}>(
    excludes: Location[],
    infos: T[],
): T[] {
    const contains = (exclude: Location, point: Location) => {
        return (
            (exclude[1] >= point[0] && exclude[1] <= point[1]) ||
            (exclude[0] >= point[0] && exclude[0] < point[1]) ||
            (exclude[0] < point[0] && exclude[1] >= point[1])
        );
    };

    return infos.filter((item) => {
        return !excludes.some((exclude) => contains(exclude, item.location));
    });
}

export function parseHeading(content: string) {
    const anchors = [];
    const commonHeading = content.match(/^#+/);
    const alternateHeading = content[content.length - 1];
    const alternaleLevels = ['-', '='];
    const level = commonHeading
        ? commonHeading[0].length
        : alternaleLevels.indexOf(alternateHeading) + 1;

    if (commonHeading) {
        content = content.replace(/^#+\s*/, '');
    } else {
        content = content.replace(/\n[-=]+$/, '');
    }

    const ANCHOR = /{(#[^}]+)}/g;

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = ANCHOR.exec(content))) {
        anchors.push(match[1]);
        content = content.replace(match[0], '');
        ANCHOR.lastIndex -= match[0].length;
    }

    const title = content.trim();

    return {anchors, title, level};
}
