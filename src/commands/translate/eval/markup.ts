import type {MarkupViolation} from './types';
import type {ProseLine} from './markdown';

import {scanPage} from './markdown';

/**
 * Structural signature of a page: everything the translation must
 * preserve verbatim, in document order. Translatable text is excluded
 * on purpose - only markup skeleton is compared.
 */
export type MarkupSignature = {
    /** Fence info strings and verbatim bodies, in order. */
    fences: {info: string; content: string}[];
    /** Normalized liquid/YFM directives, in order, e.g. `note:info`, `endnote`, `include:./x.md`. */
    liquid: string[];
    /** Link and image targets, in order. */
    links: string[];
    /** Heading levels with explicit anchors, in order, e.g. `2:#info`. */
    headings: string[];
    /** Liquid variable references, sorted, e.g. `{{user}}`. */
    variables: string[];
    /** Markdown pipe-table row count and YFM grid-table marker count. */
    tables: {pipeRows: number; gridMarkers: number};
};

const LIQUID_TAG = /{%(.*?)%}/g;
const ANCHOR = /{#([^}]+)}$/;
const VARIABLE = /(?<!not_var){{\s*([\w.-]+)\s*}}/g;

function compareStrings(left: string, right: string): number {
    return left < right ? -1 : Number(left > right);
}

/**
 * Normalizes one liquid directive into a comparable token.
 *
 * Translatable parts (cut titles, include labels) are dropped; load-bearing
 * parts (note types, include paths, condition expressions) are kept.
 */
export function normalizeLiquidTag(tag: string): string | null {
    const compact = tag.replace(/\s+/g, ' ').trim();

    const include = /^include (?:notitle )?\[[^\]]*\]\(([^)]+)\)$/.exec(compact);
    if (include) {
        return `include:${include[1]}`;
    }

    const note = /^note (\w+)/.exec(compact);
    if (note) {
        return `note:${note[1]}`;
    }

    if (compact === 'cut' || compact.startsWith('cut ')) {
        return 'cut';
    }

    if (compact === 'list tabs' || compact.startsWith('list tabs ')) {
        return 'tabs';
    }

    const keywords = ['endnote', 'endcut', 'endlist', 'else', 'endif'];
    if (keywords.includes(compact)) {
        return compact;
    }

    const condition = /^(if|elsif) (.+)$/.exec(compact);
    if (condition) {
        return `${condition[1]}:${condition[2]}`;
    }

    // Unknown directives are compared verbatim: better a false diff
    // than a silently ignored construct.
    return compact;
}

/**
 * Finds the end of a link destination started at `start`: the first
 * unbalanced closing parenthesis on the same line, tolerating one
 * level of nesting. Returns -1 for an unterminated destination.
 */
function findDestinationEnd(text: string, start: number): number {
    let depth = 0;

    for (let index = start; index < text.length; index++) {
        const char = text[index];
        if (char === '\n') {
            return -1;
        }
        if (char === '(') {
            depth++;
        } else if (char === ')') {
            if (depth === 0) {
                return index;
            }
            depth--;
        }
    }

    return -1;
}

/**
 * Normalizes a raw destination: unwraps angle brackets (`](<target>)`
 * denotes the same target, and the translate round-trip legitimately
 * normalizes the brackets away) and drops an optional title.
 */
function cleanDestination(raw: string): string {
    let target = raw.trim();

    if (target.startsWith('<') && target.endsWith('>')) {
        target = target.slice(1, -1);
    }

    const space = target.search(/\s/);
    return space === -1 ? target : target.slice(0, space);
}

/**
 * Extracts link and image destinations, in order.
 *
 * Destinations are scanned by hand: `](target)` with one level of
 * nested parentheses, which regular expressions cannot do in linear
 * time.
 */
export function extractLinkTargets(text: string): string[] {
    const targets: string[] = [];

    for (const match of text.matchAll(/\]\(/g)) {
        const start = match.index + match[0].length;
        const end = findDestinationEnd(text, start);

        if (end === -1) {
            continue;
        }

        const target = cleanDestination(text.slice(start, end));
        if (target) {
            targets.push(target);
        }
    }

    return targets;
}

function headingSignature(line: string): string | null {
    let level = 0;
    while (line[level] === '#') {
        level++;
    }

    if (!level || level > 6 || (line[level] !== ' ' && line[level] !== '\t')) {
        return null;
    }

    const anchor = ANCHOR.exec(line.trim());
    return `${level}:${anchor ? '#' + anchor[1] : ''}`;
}

function collectTables(prose: ProseLine[]): {pipeRows: number; gridMarkers: number} {
    let pipeRows = 0;
    let gridMarkers = 0;

    for (const {text} of prose) {
        const trimmed = text.trim();
        if (trimmed.startsWith('|') && trimmed.length > 1) {
            pipeRows++;
        }
        if (trimmed.startsWith('#|') || trimmed === '|#' || trimmed.endsWith('|#')) {
            gridMarkers++;
        }
        gridMarkers += countInline(trimmed, '||');
    }

    return {pipeRows, gridMarkers};
}

/**
 * Extracts the structural markup signature of a page.
 */
export function markupSignature(content: string): MarkupSignature {
    const page = scanPage(content);
    const text = page.prose.map((line) => line.text).join('\n');

    const liquid: string[] = [];
    for (const match of text.matchAll(LIQUID_TAG)) {
        const normalized = normalizeLiquidTag(match[1]);
        if (normalized) {
            liquid.push(normalized);
        }
    }

    const headings: string[] = [];
    for (const {text: line} of page.prose) {
        const heading = headingSignature(line);
        if (heading) {
            headings.push(heading);
        }
    }

    const variables: string[] = [];
    for (const match of text.matchAll(VARIABLE)) {
        variables.push(`{{${match[1]}}}`);
    }
    variables.sort(compareStrings);

    return {
        fences: page.fences,
        liquid,
        links: extractLinkTargets(stripInlineCode(text)),
        headings,
        variables,
        tables: collectTables(page.prose),
    };
}

function countInline(line: string, token: string): number {
    let count = 0;
    let index = line.indexOf(token);
    while (index !== -1) {
        count++;
        index = line.indexOf(token, index + token.length);
    }
    return count;
}

function stripInlineCode(text: string): string {
    return text.replace(/`[^`\n]*`/g, '``');
}

function preview(value: string, limit = 60): string {
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact.length > limit ? compact.slice(0, limit) + '...' : compact;
}

function compareSequences(
    type: string,
    label: string,
    source: string[],
    translated: string[],
    violations: MarkupViolation[],
) {
    if (source.length !== translated.length) {
        violations.push({
            type,
            detail: `${label}: ${source.length} in source vs ${translated.length} in translation`,
        });
        return;
    }

    for (let index = 0; index < source.length; index++) {
        if (source[index] !== translated[index]) {
            violations.push({
                type,
                detail: `${label} #${index + 1}: "${preview(source[index])}" became "${preview(translated[index])}"`,
            });
        }
    }
}

function compareFences(
    before: MarkupSignature,
    after: MarkupSignature,
    violations: MarkupViolation[],
) {
    if (before.fences.length !== after.fences.length) {
        violations.push({
            type: 'fence-count',
            detail: `code fences: ${before.fences.length} in source vs ${after.fences.length} in translation`,
        });
        return;
    }

    for (let index = 0; index < before.fences.length; index++) {
        const sourceFence = before.fences[index];
        const translatedFence = after.fences[index];
        if (sourceFence.info !== translatedFence.info) {
            violations.push({
                type: 'fence-info',
                detail: `fence #${index + 1} info: "${sourceFence.info}" became "${translatedFence.info}"`,
            });
        }
        if (sourceFence.content !== translatedFence.content) {
            violations.push({
                type: 'fence-content',
                detail: `fence #${index + 1} body changed: "${preview(sourceFence.content)}"`,
            });
        }
    }
}

/**
 * Compares the markup structure of the source page and its translation.
 *
 * Every returned violation means the translation changed something a
 * translator must never touch: code, directives, link targets, heading
 * structure, variables or table layout.
 */
export function compareMarkup(source: string, translated: string): MarkupViolation[] {
    const violations: MarkupViolation[] = [];
    const before = markupSignature(source);
    const after = markupSignature(translated);

    compareFences(before, after, violations);
    compareSequences('liquid', 'liquid directives', before.liquid, after.liquid, violations);
    compareSequences('links', 'link targets', before.links, after.links, violations);
    compareSequences('headings', 'headings', before.headings, after.headings, violations);
    compareSequences('variables', 'variables', before.variables, after.variables, violations);

    if (before.tables.pipeRows !== after.tables.pipeRows) {
        violations.push({
            type: 'tables',
            detail: `table rows: ${before.tables.pipeRows} in source vs ${after.tables.pipeRows} in translation`,
        });
    }
    if (before.tables.gridMarkers !== after.tables.gridMarkers) {
        violations.push({
            type: 'tables',
            detail: `grid table markers: ${before.tables.gridMarkers} in source vs ${after.tables.gridMarkers} in translation`,
        });
    }

    return violations;
}
