import MarkdownIt from 'markdown-it';
import {compose} from '@diplodoc/translation';

const CODE_CONTEXT = 'data-yfm-context="code"';
const parser = new MarkdownIt({html: true});

function stringLeaves(value: unknown): Map<string, string> {
    const leaves = new Map<string, string>();
    const ancestors = new Set<object>();
    const visit = (item: unknown, path: string[]) => {
        if (typeof item === 'string') leaves.set(JSON.stringify(path), item);
        else if (item && typeof item === 'object' && !ancestors.has(item)) {
            ancestors.add(item);
            for (const [key, child] of Object.entries(item)) visit(child, [...path, key]);
            ancestors.delete(item);
        }
    };
    visit(value, []);
    return leaves;
}

function references(text: string): number[] {
    return [...text.matchAll(/%%%(\d+)%%%/g)].map((match) => Number(match[1]));
}

function inlineCode(text: string) {
    const result: {content: string; markup: string}[] = [];
    const visit = (token: ReturnType<typeof parser.parse>[number]) => {
        if (token.type === 'code_inline') result.push(token);
        for (const child of token.children ?? []) visit(child);
    };
    for (const token of parser.parse(text, {})) visit(token);
    return result;
}

function matchProbedLiterals(
    source: string,
    probe: string,
    sentinels: ReadonlyMap<string, number>,
    units: readonly string[],
): Set<number> {
    const found = new Set<number>();
    const before = inlineCode(source),
        after = inlineCode(probe);
    if (before.length !== after.length) return found;
    for (const [index, token] of after.entries()) {
        if (before[index].markup !== token.markup) return new Set();
        const id = sentinels.get(token.content);
        if (id === undefined) {
            if (before[index].content !== token.content) return new Set();
            continue;
        }
        if (probe.split(token.content).length !== 2) return new Set();
        const original = String(compose('%%%0%%%', [units[id]], {useSource: true}));
        if (before[index].content !== original) return new Set();
        found.add(id);
    }
    return found.size === sentinels.size ? found : new Set();
}

function literalLeaf(source: string, skeleton: string, units: readonly string[]): Set<number> {
    const found = new Set<number>();
    if (/%%%\d+%%%/.test(source) || !skeleton.includes('`')) return found;
    const refs = references(skeleton);
    const ids = [...new Set(refs)];
    if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || !units[id])) return found;
    const local = ids.map((id) => units[id]);
    if (local.some((unit) => /%%%\d+%%%/.test(unit))) return found;
    const candidates = new Set(
        inlineCode(skeleton).flatMap(({content}) => {
            const match = /^%%%(\d+)%%%$/.exec(content);
            const id = match ? Number(match[1]) : -1;
            return refs.filter((ref) => ref === id).length === 1 ? [id] : [];
        }),
    );
    if (!candidates.size) return found;
    const occupied = [source, skeleton, ...local].join('\0');
    let serial = 0;
    let prefix = `YFMInlineLiteralProbe${serial}N`;
    while (occupied.includes(prefix)) prefix = `YFMInlineLiteralProbe${++serial}N`;
    const sentinels = new Map<string, number>();
    const probeUnits = local.map((unit, index) => {
        if (!candidates.has(ids[index])) return unit;
        const sentinel = prefix + index + 'Z';
        sentinels.set(sentinel, ids[index]);
        return unit.replace(/^(<source\b[^>]*>)[\s\S]*(<\/source>)$/, `$1${sentinel}$2`);
    });
    const indexes = new Map(ids.map((id, index) => [id, index]));
    const localSkeleton = skeleton.replace(
        /%%%(\d+)%%%/g,
        (_, id) => `%%%${indexes.get(Number(id))}%%%`,
    );
    try {
        const probe = String(compose(localSkeleton, probeUnits, {useSource: true}));
        return matchProbedLiterals(source, probe, sentinels, units);
    } catch {
        return new Set();
    }
}

/** Capture source leaves before extraction mutates YAML/JSON descriptions. */
export function snapshotInlineLiterals(source: unknown) {
    const original = stringLeaves(source);
    const literalMarkers = new Set([...original.values()].flatMap(references));
    return (skeleton: unknown, units: readonly string[]): ReadonlySet<number> => {
        const leaves = stringLeaves(skeleton);
        const counts = new Map<number, number>();
        const proven = new Map<number, number>();
        const nested = new Set(units.flatMap(references));
        for (const [path, text] of leaves) {
            for (const id of references(text)) counts.set(id, (counts.get(id) ?? 0) + 1);
            const before = original.get(path);
            if (before === undefined) continue;
            for (const id of literalLeaf(before, text, units))
                proven.set(id, (proven.get(id) ?? 0) + 1);
        }
        return new Set(
            [...proven].flatMap(([id, count]) =>
                count === counts.get(id) && !literalMarkers.has(id) && !nested.has(id) ? [id] : [],
            ),
        );
    };
}

/** Find generated unit markers in code blocks, excluding literal marker text. */
export function codeUnitIds(source: string, skeleton: string): Set<number> {
    const ids = new Set<number>();
    const code = (text: string) =>
        parser
            .parse(text, {})
            .filter((token) => token.type === 'fence' || token.type === 'code_block');
    const original = code(source);
    for (const [index, token] of code(skeleton).entries()) {
        const before = original[index];
        if (!before || before.type !== token.type) continue;
        const literal = new Map<number, number>();
        for (const match of before.content.matchAll(/%%%(\d+)%%%/g)) {
            const id = Number(match[1]);
            literal.set(id, (literal.get(id) || 0) + 1);
        }
        const seen = new Map<number, number>();
        for (const match of token.content.matchAll(/%%%(\d+)%%%/g)) {
            const id = Number(match[1]);
            const count = (seen.get(id) || 0) + 1;
            seen.set(id, count);
            if (count > (literal.get(id) || 0)) ids.add(id);
        }
    }
    return ids;
}

/** Keep source context in the cache key, never in the model-facing text. */
export function markCodeUnit(unit: string): string {
    return unit.replace(/^<source\b/, `<source ${CODE_CONTEXT}`);
}

export function isCodeUnit(unit: string): boolean {
    return unit.slice(0, unit.indexOf('>')).includes(CODE_CONTEXT);
}
