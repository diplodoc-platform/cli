import type {RawBlock} from './ranges';

import {blockShape} from './ranges';

function compatible(source: RawBlock, target: RawBlock): boolean {
    const condition = /{%\s*(?:if|elif|else|endif)\b[^%]*%}/g;
    const sourceConditions = source.text.match(condition) ?? [];
    const targetConditions = target.text.match(condition) ?? [];
    if (
        (sourceConditions.length || targetConditions.length) &&
        JSON.stringify(sourceConditions) !== JSON.stringify(targetConditions)
    )
        return false;
    const conflictingId = source.anchors.some(
        (anchor) =>
            /^(?:id:|cut:)/.test(anchor) &&
            target.anchors.some((other) => other.startsWith(anchor.split(':')[0] + ':')) &&
            !target.anchors.includes(anchor),
    );
    return (
        !conflictingId &&
        blockShape(source) === blockShape(target) &&
        JSON.stringify(source.container) === JSON.stringify(target.container)
    );
}

/** Match strong identities first, then only equal-shaped gaps inside their boundaries. */
export function correspond(before: RawBlock[], target: RawBlock[]): Map<number, number> {
    const mapped = new Map<number, number>();
    const singleTitle =
        before.filter((block) => /^# /.test(block.text)).length === 1 &&
        target.filter((block) => /^# /.test(block.text)).length === 1;
    const noteEvidence = (source: RawBlock, translated: RawBlock) => {
        const sourceChild = before[before.indexOf(source) + 1],
            targetChild = target[target.indexOf(translated) + 1];
        if (
            !sourceChild ||
            !targetChild ||
            sourceChild.container.length !== source.container.length + 1 ||
            targetChild.container.length !== translated.container.length + 1
        )
            return false;
        return sourceChild.anchors.some(
            (anchor) =>
                /^(?:code|link):/.test(anchor) &&
                targetChild.anchors.includes(anchor) &&
                before.filter((block) => block.anchors.includes(anchor)).length === 1 &&
                target.filter((block) => block.anchors.includes(anchor)).length === 1,
        );
    };
    const identity = (source: RawBlock, translated: RawBlock) =>
        compatible(source, translated) &&
        (source.anchors.some(
            (anchor) => anchor !== 'id:T' && translated.anchors.includes(anchor),
        ) ||
            (source.kind !== 'paragraph' && source.text === translated.text) ||
            (source.kind === 'marker' &&
                /^{%\s*note\b/.test(source.text) &&
                /^{%\s*note\b/.test(translated.text) &&
                noteEvidence(source, translated)) ||
            (singleTitle && /^# /.test(source.text) && /^# /.test(translated.text)));
    for (const [index, block] of before.entries()) {
        const candidates = target.flatMap((other, offset) =>
            identity(block, other) ? [offset] : [],
        );
        if (
            candidates.length === 1 &&
            before.filter((other) => identity(other, target[candidates[0]])).length === 1
        )
            mapped.set(index, candidates[0]);
    }
    const pair = (left: number[], right: number[]) => {
        if (
            !left.length ||
            left.length !== right.length ||
            left.some((index, offset) => !compatible(before[index], target[right[offset]]))
        )
            return;
        for (const [offset, index] of left.entries()) mapped.set(index, right[offset]);
    };
    const range = (start: number, end: number) =>
        Array.from({length: end - start}, (_, offset) => offset + start);
    const prefix = (indices: number[], blocks: RawBlock[]) => {
        const end = indices.findIndex((index) =>
            ['heading', 'marker'].includes(blocks[index].kind),
        );
        return end < 0 ? indices : indices.slice(0, end);
    };
    for (let pass = 0; pass < 3; pass++) {
        const anchors = [...mapped].sort((left, right) => left[0] - right[0]);
        const boundaries = [[-1, -1], ...anchors, [before.length, target.length]];
        for (let index = 1; index < boundaries.length; index++) {
            const [leftSource, leftTarget] = boundaries[index - 1];
            const [rightSource, rightTarget] = boundaries[index];
            if (rightTarget <= leftTarget || (leftSource === -1 && rightSource === before.length))
                continue;
            const left = range(leftSource + 1, rightSource),
                right = range(leftTarget + 1, rightTarget);
            pair(left, right);
            // Missing old sections must not prevent mapping the document preamble.
            if (leftSource >= 0 && before[leftSource].kind === 'heading')
                pair(prefix(left, before), prefix(right, target));
        }
    }
    return mapped;
}

/** Exact source LCS localizes changes without assuming translated strings are equal. */
export function unchangedBlocks(
    before: RawBlock[],
    after: RawBlock[],
): {old: number; next: number}[] {
    const width = after.length + 1;
    const table = new Uint32Array((before.length + 1) * width);
    for (let oldIndex = before.length - 1; oldIndex >= 0; oldIndex--)
        for (let nextIndex = after.length - 1; nextIndex >= 0; nextIndex--) {
            table[oldIndex * width + nextIndex] =
                before[oldIndex].text === after[nextIndex].text
                    ? 1 + table[(oldIndex + 1) * width + nextIndex + 1]
                    : Math.max(
                          table[(oldIndex + 1) * width + nextIndex],
                          table[oldIndex * width + nextIndex + 1],
                      );
        }
    const result = [];
    let oldIndex = 0,
        nextIndex = 0;
    while (oldIndex < before.length && nextIndex < after.length) {
        if (before[oldIndex].text === after[nextIndex].text)
            result.push({old: oldIndex++, next: nextIndex++});
        else if (
            table[(oldIndex + 1) * width + nextIndex] >= table[oldIndex * width + nextIndex + 1]
        )
            oldIndex++;
        else nextIndex++;
    }
    return result;
}
