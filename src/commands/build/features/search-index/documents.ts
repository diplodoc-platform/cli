import type {EntryInfo} from '~/commands/build';
import type {SearchDocument} from './types';

import {createHash} from 'node:crypto';
import {parse} from 'node-html-parser';

import {shortLink} from '~/core/utils';

function strings(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
}

/** Convert resolved entry content into a backend-neutral page document. */
export function createDocument(
    path: string,
    lang: string,
    info: DeepFrozen<EntryInfo>,
    pretty: boolean,
): SearchDocument | undefined {
    const meta = info.meta || {};
    if (meta.noIndex || (meta['docs-viewer'] as {noIndex?: boolean} | undefined)?.noIndex)
        return undefined;
    const root = parse(info.html || '');
    root.querySelectorAll('script,style').forEach((node) => node.remove());
    const extracted = root.querySelectorAll('h1,h2,h3,h4,h5,h6').map((node) => node.text.trim());
    const renderedTitle = parse(info.title || String(meta.title || '') || extracted[0] || '');
    renderedTitle.querySelectorAll('script,style').forEach((node) => node.remove());
    const title = renderedTitle.structuredText.trim();
    const headings = [...new Set([title, ...extracted].filter(Boolean))];
    const description =
        typeof meta.description === 'string' ? parse(meta.description).structuredText : '';
    // Entry rendering normalizes keywords to a comma-separated string.
    const keywords: unknown = meta.keywords;
    path = path.replace(/\\/g, '/');
    const url = path.replace(/\.[^/.]+$/, '.html');
    return {
        id: createHash('sha256').update(path).digest('hex'),
        path,
        url: pretty ? shortLink(url) : url,
        lang,
        title,
        content: root.structuredText.trim() || [title, description].filter(Boolean).join('\n'),
        headings,
        keywords:
            typeof keywords === 'string'
                ? keywords
                      .split(',')
                      .map((keyword) => keyword.trim())
                      .filter(Boolean)
                : strings(keywords),
        tags: strings(meta.tags).filter((tag) => tag && !tag.startsWith('_')),
    };
}
