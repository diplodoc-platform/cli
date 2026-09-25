/**
 * Keeps link and image addresses out of the model's reach.
 *
 * `extract` carries the address of a link inside the placeholders of the
 * unit. A link contained in the fragment is a `<g ctype="link">` wrapper
 * with the address in `x-end` and `equiv-text`; a link crossing the
 * fragment edge leaves a run of `<x>` placeholders side by side, standing
 * for `]`, `(`, the address, the title and `)`. `compose` writes whatever
 * the translated fragment has in those attributes, so an address the model
 * rewrote reaches the output unnoticed:
 *
 * ```
 * source: <g ctype="link" ... x-end="](https://github.com/ytsaurus/ytsaurus/commit/8013fee)">
 * answer: <g ctype="link" ... x-end="](https://github.com/ytsaurus/ytsaurus/ytsaurus/commit/8013fee)">
 * ```
 *
 * The model decides where a placeholder goes, not what it says. It gets
 * link and image placeholders with their type and id only, and a run of
 * them as its first placeholder alone, so a part of a link cannot get lost
 * on its own. Every placeholder of the answer is then replaced with the
 * source placeholder of the same id, and the first one of a run with the
 * whole run.
 */

import type {SeedHint} from './cache';

/** Opening or self-closing inline tag: its name and attributes. */
const PLACEHOLDER = /<([gx])\b([^>]*?)\/?>/g;

/** Opening or closing `<g>` tag, for the nesting check. */
const WRAPPER = /<(\/?)g\b[^>]*>/g;

/** Types of the placeholders that carry an address: links, images and their parts. */
const ADDRESS_TYPE = /^(?:link|image)(?:_|$)/;

type Placeholder = {
    tag: string;
    name: string;
    id?: string;
    ctype?: string;
    start: number;
    end: number;
};

function attr(attrs: string, name: string): string | undefined {
    return new RegExp(String.raw`(?:^|\s)${name}="([^"]*)"`).exec(attrs)?.[1];
}

function placeholders(text: string): Placeholder[] {
    return [...text.matchAll(PLACEHOLDER)].map((match) => ({
        tag: match[0],
        name: match[1],
        id: attr(match[2], 'id'),
        ctype: attr(match[2], 'ctype'),
        start: match.index,
        end: match.index + match[0].length,
    }));
}

function key(placeholder: Placeholder): string {
    return `${placeholder.name}:${placeholder.id}`;
}

function isAddress(placeholder: Placeholder): boolean {
    return Boolean(placeholder.ctype && ADDRESS_TYPE.test(placeholder.ctype));
}

/** Placeholders of the text by id, with the ones that can be told apart by it. */
function inventory(text: string) {
    const found = placeholders(text);
    const counts = new Map<string, number>();

    for (const placeholder of found) {
        counts.set(key(placeholder), (counts.get(key(placeholder)) || 0) + 1);
    }

    const isUnique = (placeholder: Placeholder) =>
        placeholder.id !== undefined && counts.get(key(placeholder)) === 1;

    return {found, counts, isUnique};
}

/**
 * Placeholders of the text in groups: the parts of one link `extract`
 * left side by side make a run, any other placeholder is a group of its
 * own, a `<g>` wrapper included.
 */
function groups(found: Placeholder[]): Placeholder[][] {
    const result: Placeholder[][] = [];
    let last: Placeholder | undefined;

    for (const placeholder of found) {
        const joins =
            last &&
            isAddress(last) &&
            isAddress(placeholder) &&
            last.name === 'x' &&
            placeholder.name === 'x' &&
            last.end === placeholder.start;

        if (joins) {
            result[result.length - 1].push(placeholder);
        } else {
            result.push([placeholder]);
        }

        last = placeholder;
    }

    return result;
}

/** Link and image placeholders of the text, a run of link parts as one group. */
function addressRuns(found: Placeholder[]): Placeholder[][] {
    return groups(found).filter(([first]) => isAddress(first));
}

/**
 * The unit as the model gets it: link and image placeholders without
 * their attributes, each run of them as its first placeholder alone.
 *
 * A placeholder whose id repeats in the unit could not be put back by
 * the id, so its run is sent as is.
 */
export function maskAddresses(unit: string): string {
    const {found, isUnique} = inventory(unit);
    let result = '';
    let position = 0;

    for (const run of addressRuns(found)) {
        if (!run.every(isUnique)) {
            continue;
        }

        const [{name, ctype, id, start}] = run;
        const short =
            name === 'g' ? `<g ctype="${ctype}" id="${id}">` : `<x ctype="${ctype}" id="${id}"/>`;

        result += unit.slice(position, start) + short;
        position = run[run.length - 1].end;
    }

    return result + unit.slice(position);
}

/**
 * Puts the source placeholders back into an answer to `maskAddresses`:
 * every `<x>` and `<g>` of the answer is replaced with the source one of
 * the same id, whatever the model wrote in its attributes, and the first
 * placeholder of a run with the whole run.
 *
 * Only for answers to a masked unit: in any other text the rest of a run
 * would follow its first placeholder twice.
 */
export function unmaskAddresses(source: string, answer: string): string {
    const {found, isUnique} = inventory(source);
    const originals = new Map<string, string>();

    for (const placeholder of found) {
        if (isUnique(placeholder)) {
            originals.set(key(placeholder), placeholder.tag);
        }
    }

    for (const run of addressRuns(found)) {
        if (run.every(isUnique)) {
            originals.set(key(run[0]), source.slice(run[0].start, run[run.length - 1].end));
        }
    }

    return answer.replace(PLACEHOLDER, (tag: string, name: string, attrs: string) => {
        return originals.get(`${name}:${attr(attrs, 'id')}`) ?? tag;
    });
}

/** Attribute `id` of a tag, with the space before it. */
const ID = /\sid="[^"]*"/;

/**
 * Reference to another unit, e.g. the title of a link. Units are numbered
 * across the document, so the same title has another number in another
 * file or after a sentence added above.
 */
const UNIT_REFERENCE = /%%%\d+%%%/g;

/** The group as the text has it, ids left out: what the placeholders say. */
function signature(text: string, group: Placeholder[]): string {
    return text
        .slice(group[0].start, group[group.length - 1].end)
        .replace(new RegExp(ID, 'g'), '')
        .replace(UNIT_REFERENCE, '%%%%%%');
}

function isSameShape(one: Placeholder[], other: Placeholder[]): boolean {
    return (
        one.length === other.length &&
        one.every((placeholder, index) => placeholder.ctype === other[index].ctype)
    );
}

/**
 * Pairs the placeholder groups of a text with the groups of the target
 * that say the same. The links left over on both sides are the same
 * links with other addresses when they can be told apart: a single one
 * on each side, or, for texts in the same language (`ordered`), the same
 * number of them in the same order.
 */
function pairGroups(target: string, text: string, ordered: boolean) {
    const own = groups(placeholders(target)).map((group) => ({
        group,
        signature: signature(target, group),
        used: false,
    }));
    const theirs = groups(placeholders(text));
    const pairs = new Map<Placeholder[], Placeholder[]>();

    for (const group of theirs) {
        const match = own.find((candidate) => {
            return !candidate.used && candidate.signature === signature(text, group);
        });

        if (match) {
            match.used = true;
            pairs.set(group, match.group);
        }
    }

    const ownLinks = own.filter(({group, used}) => !used && isAddress(group[0]));
    const theirLinks = theirs.filter((group) => !pairs.has(group) && isAddress(group[0]));
    const paired =
        ownLinks.length === theirLinks.length &&
        (ordered || ownLinks.length === 1) &&
        ownLinks.every(({group}, index) => isSameShape(group, theirLinks[index]));

    if (paired) {
        ownLinks.forEach(({group}, index) => pairs.set(theirLinks[index], group));
    }

    return {theirs, pairs};
}

/**
 * Gives the placeholders of a text the ids of the target groups they are
 * paired with, see `pairGroups`, and spare ids from `spare` to the rest.
 */
function renumber(target: string, text: string, ordered: boolean, spare: {count: number}) {
    const {theirs, pairs} = pairGroups(target, text, ordered);
    let result = '';
    let position = 0;

    for (const group of theirs) {
        const match = pairs.get(group);

        for (const [index, placeholder] of group.entries()) {
            const id = match?.[index].id ?? `${placeholder.name}-m${++spare.count}`;

            result +=
                text.slice(position, placeholder.start) +
                placeholder.tag.replace(ID, ` id="${id}"`);
            position = placeholder.end;
        }
    }

    return result + text.slice(position);
}

/**
 * Gives the placeholders of a memory entry - the previous version of a
 * fragment and its existing translation - the ids they have in the
 * fragment itself.
 *
 * `extract` numbers placeholders in the order they come, so the existing
 * translation has its own ids: `[spec](b) [computation](a)` translated in
 * the other word order swaps `g-1` and `g-2`. A model applying an edit
 * copies the existing translation with its ids, and `unmaskAddresses`
 * would then put the wrong source placeholder at each of them.
 *
 * The previous source is numbered after the fragment: a group takes the
 * ids of the fragment group that says the same, and the links an edit
 * gave other addresses pair up in order, as both texts are in the same
 * language. The translation is numbered after the previous source the
 * same way, except for the order: a single link left on each side is the
 * same link with another address, e.g. a localized one. It gets the
 * address of the source. Groups without a pair get ids the fragment does
 * not have, so they cannot stand for its placeholders.
 */
export function renumberMemory(fragment: string, hint: SeedHint): SeedHint {
    const spare = {count: 0};
    const source = renumber(fragment, hint.source, true, spare);

    return {source, translation: renumber(source, hint.translation, false, spare)};
}

/** Tells whether every `<g>` of the text is closed, in order. */
function isNested(text: string): boolean {
    let depth = 0;

    for (const [tag, closing] of text.matchAll(WRAPPER)) {
        if (closing) {
            depth--;
        } else if (!tag.endsWith('/>')) {
            depth++;
        }

        if (depth < 0) {
            return false;
        }
    }

    return depth === 0;
}

/**
 * Tells whether a translation with its placeholders put back still has
 * the links and images of the source fragment, and has them whole.
 *
 * Every link and image placeholder of the source has to be there as many
 * times as in the source: a lost one breaks the link (`[Issue(url)` for a
 * lost `]`), a repeated one prints a part of it twice. A placeholder the
 * source does not have keeps the attributes the model wrote: a link or
 * image one brings an address of the model's own, and one without a type
 * cannot be composed at all. A `<g>` left open wraps the rest of the line
 * into the link.
 *
 * Other placeholders are the business of `keepsMarkup`: a model may write
 * the marker of an emphasis or a code span itself, and that composes.
 */
export function keepsPlaceholders(source: string, translation: string): boolean {
    const expected = inventory(source);
    const actual = inventory(translation);

    for (const placeholder of expected.found) {
        const count = actual.counts.get(key(placeholder));

        if (isAddress(placeholder) && count !== expected.counts.get(key(placeholder))) {
            return false;
        }
    }

    for (const placeholder of actual.found) {
        const invented = !expected.counts.has(key(placeholder));

        if (invented && (!placeholder.ctype || isAddress(placeholder))) {
            return false;
        }
    }

    return isNested(translation);
}
