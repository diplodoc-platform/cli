export type RawRange = {start: number; end: number};
export type TargetEdit = RawRange & {expected: string; replacement: string};

/** Apply validated, nonoverlapping changes without serializing untouched text. */
export function applyTargetEdits(target: string, edits: TargetEdit[]): string {
    const ordered = [...edits].sort((left, right) => left.start - right.start);
    let previous: TargetEdit | undefined;
    for (const edit of ordered) {
        if (
            !Number.isInteger(edit.start) ||
            !Number.isInteger(edit.end) ||
            edit.start < 0 ||
            edit.end < edit.start ||
            edit.end > target.length ||
            target.slice(edit.start, edit.end) !== edit.expected
        ) {
            throw new Error('Invalid or stale target edit');
        }
        if (previous && (edit.start < previous.end || edit.start === previous.start)) {
            throw new Error('Overlapping target edits');
        }
        previous = edit;
    }
    return ordered
        .reverse()
        .reduce(
            (text, edit) => text.slice(0, edit.start) + edit.replacement + text.slice(edit.end),
            target,
        );
}
