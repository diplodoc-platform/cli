import {linkRelation, unitLinks} from './align';

/**
 * Pairs every link of a source with a link of its translation, one to
 * one, or returns null when a link of either side is left without a pair.
 * A link pairs with a link to the same page first (see `linkRelation`);
 * with `loose`, then with one to the page under another section of another
 * site or in the other edition of the site.
 */
export function pairLinks(
    source: string[],
    target: string[],
    languages: string[],
    loose: boolean,
): [string, string][] | null {
    if (source.length !== target.length) {
        return null;
    }

    const left = [...target];
    const pairs: [string, string][] = [];
    const take = (url: string, accepted: (other: string) => boolean) => {
        const index = left.findIndex(accepted);
        if (index < 0) {
            return false;
        }
        pairs.push([url, left[index]]);
        left.splice(index, 1);
        return true;
    };

    const unpaired = source.filter(
        (url) => !take(url, (other) => linkRelation(url, other, languages) === 'same'),
    );
    for (const url of unpaired) {
        if (!loose || !take(url, (other) => linkRelation(url, other, languages) !== 'other')) {
            return null;
        }
    }

    return pairs;
}

/**
 * The addresses a translator localized in a file: a source address mapped
 * to the one its translation uses instead. An address the translation
 * keeps as is somewhere, or localizes differently in two places, is left
 * out: there is no single localized form of it to check against.
 */
export function localizedUrls(pairs: [string, string][], languages: string[]): Map<string, string> {
    const variants = new Map<string, Set<string>>();

    for (const [source, target] of pairs) {
        for (const [from, to] of pairLinks(unitLinks(source), unitLinks(target), languages, true) ||
            []) {
            const set = variants.get(from) || new Set<string>();
            set.add(to);
            variants.set(from, set);
        }
    }

    const result = new Map<string, string>();
    for (const [from, set] of variants) {
        const [to] = set;
        if (set.size === 1 && to !== from) {
            result.set(from, to);
        }
    }

    return result;
}

/**
 * Source addresses the output links again although the existing
 * translation of the file localized them: the sentence went to the model,
 * which takes link addresses from the source. Each address once, with its
 * localized form.
 */
export function revertedUrls(parts: string[], localized: Map<string, string>): [string, string][] {
    if (!localized.size) {
        return [];
    }

    const result = new Map<string, string>();
    for (const part of parts) {
        const urls = unitLinks(part);
        for (const url of urls) {
            const to = localized.get(url);
            if (to !== undefined && !urls.includes(to)) {
                result.set(url, to);
            }
        }
    }

    return [...result];
}
