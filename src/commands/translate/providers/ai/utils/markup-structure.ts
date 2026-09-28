import {compose, extract} from '@diplodoc/translation';

const TAG = /<\/?(?:g|x)\b[^>]*>/g;
const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];

/** Restore symmetric markup crossing a unit boundary before parsing it. */
function boundaries(source: string): [string, string] {
    const before: string[] = [];
    const open: string[] = [];
    for (const [tag] of source.matchAll(/<x\b[^>]*\/>/g)) {
        const marker = attr(tag, 'equiv-text');
        const type = attr(tag, 'ctype') || '';
        if (!marker || !/^(?:\*{1,3}|_{1,3}|`+|~~|\^)$/.test(marker)) {
            continue;
        }
        if (type.endsWith('_open')) {
            open.push(marker);
        } else if (type.endsWith('_close')) {
            const index = open.lastIndexOf(marker);
            if (index < 0) {
                before.push(marker);
            } else {
                open.splice(index, 1);
            }
        }
    }
    const linkPrefix =
        source.includes('ctype="link_text_part_close"') &&
        !source.includes('ctype="link_text_part_open"')
            ? '['
            : '';
    return [before.reverse().join('') + linkPrefix, open.reverse().join('')];
}

/** Structural inventory from the same YFM extractor used by translation. */
export function markupSignature(markdown: string): string[] {
    const {skeleton, units, warnings} = extract(markdown, {
        compact: false,
        source: {language: 'en', locale: 'US'},
        target: {language: 'ru', locale: 'RU'},
    });
    if (warnings?.length) {
        throw new Error('Cannot safely parse fragment markup');
    }
    // Empty lines separate blocks. Do not erase them along with the spaces
    // between sentences: that would accept a newly invented paragraph.
    const blockBreaks = skeleton.trim().match(/\r?\n[\t ]*(?:\r?\n[\t ]*)+/g)?.length || 0;
    const result = [
        'skeleton:' + skeleton.replace(/%%%\d+%%%/g, '').replace(/\s+/g, ''),
        'block-breaks:' + blockBreaks,
    ];
    for (const unit of units) {
        const parents: string[] = [];
        for (const [tag] of unit.matchAll(TAG)) {
            if (tag.startsWith('</g')) {
                parents.pop();
                continue;
            }
            const key = tag.replace(/\s+id="[^"]*"/g, '');
            result.push([...parents, key].join('/'));
            if (tag.startsWith('<g')) {
                parents.push(key);
            }
        }
    }
    return result.sort();
}

/** Returns an actionable retry reason when a translation changes YFM structure. */
export function markupStructureIssue(source: string, translation: string): string | undefined {
    if (source === translation) {
        return undefined;
    }
    try {
        const [before, after] = boundaries(source);
        // Link titles can reference units outside this fragment. A stable
        // stand-in lets compose render the link without those other units.
        // Escape raw HTML for the XML reader so it reaches the YFM parser
        // instead of being silently discarded as an unknown XML element.
        const render = (text: string) =>
            String(
                compose(
                    before + '%%%0%%%' + after,
                    [
                        `<source xml:space="preserve">${text.replace(/%%%([0-9]+)%%%/g, 'unit-reference-$1').replace(/<(?!\/?[gx]\b)[^>]+>/g, (tag) => tag.replace(/</g, '&lt;').replace(/>/g, '&gt;'))}</source>`,
                    ],
                    {useSource: true},
                ),
            );
        const expected = markupSignature(render(source));
        const actual = markupSignature(render(translation));
        if (JSON.stringify(expected) !== JSON.stringify(actual)) {
            return 'The translation changed Markdown/YFM structure. Preserve the original formatting, links, code, directives and placeholders; do not add formatting to plain text.';
        }
    } catch {
        return 'The translation could not be checked as Markdown/YFM. Preserve every source placeholder and return only the translated text with no new markup.';
    }
    return undefined;
}
