import type {AssetInfo, ImageOptions, Location} from './types';
import type {ConstructorBlock, PageContent} from '@diplodoc/page-constructor-extension';

import {load as yamlLoad} from 'js-yaml';

import {MEDIA_FORMATS, parseLocalUrl, walkLinks} from '~/core/utils';

type AssetModifier = '!' | '@' | '';

const modifiers = {'!': 'image', '@': 'video', '': 'link'} as const;

export function findLink(content: string): string | undefined {
    const rx = /]\(\s*/g;
    const match = rx.exec(content);
    if (!match) {
        return undefined;
    }

    const link = parseLinkDestination(content, rx.lastIndex);

    if (link === null || link.match(/[${}]/)) {
        return undefined;
    }

    rx.lastIndex += link.length + 1;

    return link;
}

export function extractImages(block: ConstructorBlock | string): string[] {
    const images: string[] = [];

    if (!block) {
        return images;
    }

    if (typeof block === 'string') {
        const trimmedBlock = block.trim();

        if (MEDIA_FORMATS.test(trimmedBlock) && trimmedBlock.split(/\s+/).length === 1) {
            images.push(trimmedBlock);
        }

        return images;
    }

    walkLinks(block, (value) => {
        if (MEDIA_FORMATS.test(value) && value.split(/\s+/).length === 1) {
            images.push(value);
        }
    });

    return images;
}

export function parsePcBlocks(blocks: ConstructorBlock[] = [], images: string[] = []): string[] {
    for (const block of blocks) {
        images.push(...extractImages(block));
    }

    return images;
}

export function getPcIconTitle(iconPath: string): string {
    const file = iconPath.split('/').pop() || iconPath;

    return file.replace(/\.[^.]+$/, '');
}

export const PC_REGEX = /^([ \t]*):::\s*page-constructor[ \t]*\r?\n?/gm;

export function findPcImages(content: string): AssetInfo[] {
    const pcImages: AssetInfo[] = [];
    const openRegex = PC_REGEX;

    let match: RegExpExecArray | null;

    while ((match = openRegex.exec(content))) {
        const indent = match[1] || '';
        const startIdx = openRegex.lastIndex;
        const closeRegex = new RegExp(`^${indent}:::[ \\t]*$`, 'mg');

        closeRegex.lastIndex = startIdx;

        const closeMatch = closeRegex.exec(content);

        if (!closeMatch) {
            continue;
        }

        const rawBlock = content.slice(startIdx, closeMatch.index);
        let data: PageContent;

        try {
            data = yamlLoad(rawBlock) as PageContent;
        } catch {
            continue;
        }

        const images = parsePcBlocks(data?.blocks as ConstructorBlock[], []);

        for (const img of images) {
            const parsed = parseLocalUrl(img);

            if (!parsed) {
                continue;
            }

            pcImages.push({
                ...parsed,
                type: 'image',
                subtype: 'image',
                title: getPcIconTitle(img),
                autotitle: false,
                hash: null,
                search: null,
                location: [match.index, closeRegex.lastIndex],
                // no inline svg inside page-constructor because we hasn't a location for asset
                options: {width: undefined, height: undefined, inline: false},
            });
        }

        openRegex.lastIndex = closeRegex.lastIndex;
    }

    return pcImages;
}

export function findLinksInfo(content: string): AssetInfo[] {
    const links = find(/]\(\s*/g, content, (match, rx) => {
        const link = parseLinkDestination(content, rx.lastIndex);
        const title = parseLinkTitle(content, rx.lastIndex - match[0].length);
        const options = parseLinkOptions(content, rx.lastIndex + (link?.length || 0) + 1);

        // TODO: add more precise filter for unix compatible paths
        if (link === null || title === null || link.match(/[${}]/)) {
            return undefined;
        }

        const parsed = parseLocalUrl(link);
        if (!parsed) {
            return undefined;
        }

        const modifier = content[
            rx.lastIndex - match[0].length - title.length - 2
        ] as AssetModifier;
        const type = modifiers[modifier] || 'link';

        rx.lastIndex += link.length + 1;

        return {
            ...parsed,
            type,
            subtype: type === 'image' ? 'image' : null,
            title,
            autotitle: type === 'link' && (!title || title === '{#T}'),
            options,
        };
    });

    const referenceLinks = find(/]\[\s*/g, content, (match, rx) => {
        let link = parseLinkDestination(content, rx.lastIndex, ['[', ']']);
        let title = parseLinkTitle(content, rx.lastIndex - match[0].length);
        const options = parseLinkOptions(content, rx.lastIndex + (link?.length || 0) + 1);

        // TODO: add more precise filter for unix compatible paths
        if ((link === null && title === null) || link?.match(/[${}]/)) {
            return undefined;
        }
        title = title || '';
        link = link || title;

        const parsed = parseLocalUrl(link);
        if (!parsed) {
            return undefined;
        }

        const modifier = content[
            rx.lastIndex - match[0].length - title.length - 2
        ] as AssetModifier;
        const type = modifiers[modifier] || 'link';

        rx.lastIndex += (content[rx.lastIndex] === ']' ? 0 : link.length) + 1;

        return {
            ...parsed,
            type,
            subtype: 'reference',
            code: link,
            title,
            autotitle: type === 'link' && (!title || title === '{#T}'),
            options,
        };
    });

    return [...links, ...referenceLinks];
}

export function findDefs(content: string): AssetInfo[] {
    return find(/^\s*\[(.*?)]:\s*([^\s]+)/gm, content, (match) => {
        const parsed = parseLocalUrl(match[2]);
        if (!parsed) {
            return undefined;
        }

        return {
            ...parsed,
            type: 'def',
            code: match[1] || undefined,
            title: '',
            autotitle: true,
        };
    });
}

function find(
    matcher: RegExp,
    content: string,
    map: (match: RegExpMatchArray, rx: RegExp) => Omit<AssetInfo, 'location'> | void,
): AssetInfo[] {
    const links: AssetInfo[] = [];

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = matcher.exec(content))) {
        const result = map(match, matcher);
        if (!result) {
            continue;
        }

        if (result) {
            links.push({
                ...result,
                location: [match.index, matcher.lastIndex],
            });
        }
    }

    return links;
}

function parseLinkDestination(str: string, start: number, symbols = ['(', ')']) {
    const max = str.length;
    const [symbolStart, symbolEnd] = symbols.map((symbol) => symbol.charCodeAt(0));

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

        if (code === symbolStart /* ( or [ */) {
            level++;
            if (level > 32) {
                return null;
            }
        }

        if (code === symbolEnd /* ) or ] */) {
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

function parseLinkTitle(str: string, start: number) {
    let code,
        prev,
        level = 0,
        pos = start;

    while (pos >= 0) {
        code = str.charCodeAt(pos);
        prev = str.charCodeAt(pos - 1);

        // ascii control characters
        if (code < 0x20 || code === 0x7f) {
            break;
        }

        if (prev === 0x5c /* \ */) {
            pos -= 2;
            continue;
        }

        if (code === 93 /* ] */) {
            level++;
            if (level > 32) {
                return null;
            }
        }

        if (code === 91 /* [ */) {
            if (level === 1) {
                break;
            }
            level--;
        }

        pos--;
    }

    return str.slice(pos + 1, start);
}

function parseLinkOptions(str: string, start: number): ImageOptions {
    const max = str.length;
    const options: ImageOptions = {
        width: undefined,
        height: undefined,
        inline: undefined,
    };
    let code,
        level = 0,
        pos = start,
        startOption = start;

    if (str[pos - 1] !== ')') {
        level--;
    }
    if (str.charCodeAt(pos) !== 0x7b /* { */ && level === 0) {
        return options;
    }

    while (pos < max) {
        code = str.charCodeAt(pos);

        if (code === 0x29 /* ) */ && level === -1) {
            if (str.charCodeAt(pos + 1) !== 0x7b) {
                return options;
            }
            level++;
        }

        if (code === 0x7b /* { */ && level > -1) {
            level++;
            startOption = pos + 1;
            if (level > 32) {
                return options;
            }
        }

        if (code === 0x7d /* } */) {
            if (level === 1) {
                level--;
                break;
            }
            level--;
        }

        pos++;
    }

    if (start === pos || level !== 0) {
        return options;
    }

    const attrRegex = /(\w+)=(?:'([^']*)'|"([^"]*)"|(\S+))/g;
    const optionsString = str.slice(startOption, pos);
    let match;

    while ((match = attrRegex.exec(optionsString)) !== null) {
        const key = match[1] as keyof ImageOptions;
        const value = match[2] || match[3] || match[4];

        if (key === 'inline') {
            options[key] = value === 'true';
        } else {
            options[key] = value;
        }
    }

    return options;
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

    const ANCHOR = /[^[]{(#[^}]+)}/g;

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
