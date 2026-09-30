import type {PlannedChange} from './plan';
import type {RawBlock} from './ranges';

import {extractRawBlocks} from './ranges';

type Header = {block: RawBlock; label: string; selected: boolean};

function headers(text: string): Header[] {
    return extractRawBlocks(text).flatMap((block) => {
        if (
            block.kind !== 'list' ||
            !block.container.some((part) => part.startsWith('list:tabs')) ||
            !/^- [^\r\n]+$/.test(block.text)
        )
            return [];
        const selected = /\s+\{selected\}\s*$/.test(block.text);
        const label = block.text
            .replace(/\s+\{selected\}\s*$/, '')
            .slice(2)
            .trimEnd();
        return label ? [{block, label, selected}] : [];
    });
}

function uniformSelection(values: Header[]): string | null {
    const selected = values.filter((item) => item.selected);
    if (selected.length < 2 || selected.some((item) => item.label !== selected[0].label))
        return null;
    return selected[0].label;
}

/** Apply only a uniform tab switch when every target header still matches the old source. */
export function planTabSelections(
    before: string,
    after: string,
    target: string,
): PlannedChange[] | null {
    const old = headers(before),
        next = headers(after),
        translated = headers(target);
    if (!old.length || old.length !== next.length || old.length !== translated.length) return null;
    if (
        old.some(
            (item, index) =>
                item.label !== next[index].label ||
                item.block.text !== translated[index].block.text,
        )
    )
        return null;
    const previousSelection = uniformSelection(old),
        newSelection = uniformSelection(next);
    if (!previousSelection || !newSelection || previousSelection === newSelection) return null;
    if (old.filter((item) => item.selected).length !== next.filter((item) => item.selected).length)
        return null;
    const changed = old.flatMap((item, index) =>
        item.block.text === next[index].block.text ? [] : [index],
    );
    let reconstructed = before;
    for (const index of [...changed].reverse()) {
        const block = old[index].block;
        reconstructed =
            reconstructed.slice(0, block.start) +
            next[index].block.text +
            reconstructed.slice(block.end);
    }
    if (reconstructed !== after) return null;
    return changed.map((index) => {
        const source = old[index].block,
            replacement = next[index].block,
            destination = translated[index].block;
        return {
            target: {start: destination.start, end: destination.end},
            sourceLine: before.slice(0, source.start).split(/\r?\n/).length,
            expected: destination.text,
            sourceBefore: source.text,
            sourceAfter: replacement.text,
            previousTranslation: destination.text,
            contextBefore: '',
            contextAfter: '',
            literalOutput: replacement.text,
        };
    });
}
