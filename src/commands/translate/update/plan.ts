import type {Snapshot, UpdateDiagnostic} from './types';
import type {RawRange} from './apply';
import type {RawBlock} from './ranges';

import {normalizeProseWhitespace} from './protected';
import {extractRawBlocks} from './ranges';
export type PlannedChange = {
    target: RawRange;
    expected: string;
    sourceBefore: string;
    sourceAfter: string;
    previousTranslation: string;
    contextBefore: string;
    contextAfter: string;
    insertion?: boolean;
};
export type UpdatePlan =
    | {ok: true; changes: PlannedChange[]}
    | {ok: false; diagnostic: UpdateDiagnostic};
const conflict = (
    message: string,
    code: UpdateDiagnostic['code'] = 'target_alignment_conflict',
): UpdatePlan => ({ok: false, diagnostic: {code, message}});

/** Plan source deltas only; the model never decides which target spans may change. */
export function planUpdate(snapshot: Snapshot): UpdatePlan {
    if (snapshot.sourceBefore === null || snapshot.targetBefore === null) {
        return conflict('Update requires existing source and target snapshots', 'missing_target');
    }
    if (snapshot.sourceBefore === snapshot.sourceAfter) {
        return {ok: true, changes: []};
    }
    const before = extractRawBlocks(snapshot.sourceBefore);
    const after = extractRawBlocks(snapshot.sourceAfter);
    const target = extractRawBlocks(snapshot.targetBefore);
    const unique = (blocks: RawBlock[]) =>
        new Set(blocks.map((block) => block.text)).size === blocks.length;
    if (!unique(before) || !unique(after)) {
        return conflict('Repeated source blocks make the delta ambiguous');
    }
    const unchanged = before.flatMap((block, index) => {
        const next = after.findIndex((candidate) => candidate.text === block.text);
        return next < 0 ? [] : [{old: index, next}];
    });
    if (unchanged.some((pair, index) => index > 0 && pair.next <= unchanged[index - 1].next)) {
        return conflict('Reordered source blocks are unsupported');
    }
    const map = (index: number): number => {
        const block = before[index];
        if (!block) {
            return -1;
        }
        const candidates = target
            .map((candidate, position) => ({candidate, position}))
            .filter(({candidate}) => {
                if (candidate.kind !== block.kind) {
                    return false;
                }
                if (block.anchors.length) {
                    return block.anchors.some((anchor) => candidate.anchors.includes(anchor));
                }
                return (
                    /^# /.test(block.text) &&
                    /^# /.test(candidate.text) &&
                    before.filter((item) => /^# /.test(item.text)).length === 1
                );
            });
        if (candidates.length !== 1) {
            return -1;
        }
        const chosen = candidates[0];
        // A target anchor shared by several source blocks is not an identity.
        if (
            block.anchors.length &&
            before.some(
                (other, position) =>
                    position !== index &&
                    other.anchors.some((anchor) => chosen.candidate.anchors.includes(anchor)),
            )
        ) {
            return -1;
        }
        return chosen.position;
    };
    const changes: PlannedChange[] = [];
    const matches = [{old: -1, next: -1}, ...unchanged, {old: before.length, next: after.length}];
    for (let index = 1; index < matches.length; index++) {
        const left = matches[index - 1];
        const right = matches[index];
        const removed = before.slice(left.old + 1, right.old);
        const added = after.slice(left.next + 1, right.next);
        if (!removed.length && !added.length) {
            continue;
        }
        if ([...removed, ...added].some((block) => block.kind === 'opaque')) {
            return conflict(
                'Changed structural container has no safe raw mapping',
                'unsupported_structure',
            );
        }
        if (removed.length > 1 || added.length > 1) {
            return conflict('Multiple block repartitioning requires explicit correspondence');
        }
        const sourceBefore = removed[0]?.text ?? '';
        const sourceAfter = added[0]?.text ?? '';
        if (normalizeProseWhitespace(sourceBefore) === normalizeProseWhitespace(sourceAfter)) {
            continue;
        }
        let range: RawRange;
        let expected = '';
        if (removed.length) {
            const mapped = map(left.old + 1);
            if (mapped < 0) {
                return conflict('Changed block has no unique target anchor');
            }
            const block = target[mapped];
            if (block.kind === 'opaque') {
                return conflict('Target container cannot be replaced', 'unsupported_structure');
            }
            const previous = left.old >= 0 ? map(left.old) : -1;
            const next = right.old < before.length ? map(right.old) : -1;
            if ((previous >= 0 && previous >= mapped) || (next >= 0 && next <= mapped)) {
                return conflict('Target block order differs from source');
            }
            range = {start: block.start, end: block.end};
            expected = block.text;
        } else {
            const previous = left.old >= 0 ? map(left.old) : -1;
            const next = right.old < before.length ? map(right.old) : target.length;
            if ((left.old >= 0 && previous < 0) || next < 0 || next !== previous + 1) {
                return conflict('Insertion boundary is missing or contains target-only blocks');
            }
            const start = next < target.length ? target[next].start : snapshot.targetBefore.length;
            range = {start, end: start};
        }
        changes.push({
            target: range,
            expected,
            sourceBefore,
            sourceAfter,
            previousTranslation: expected,
            contextBefore:
                before[left.old]?.kind === 'opaque' ? '' : (before[left.old]?.text ?? ''),
            contextAfter:
                before[right.old]?.kind === 'opaque' ? '' : (before[right.old]?.text ?? ''),
            insertion: !removed.length,
        });
    }
    const ordered = [...changes].sort((a, b) => a.target.start - b.target.start);
    if (
        ordered.some(
            (change, index) => index > 0 && change.target.start <= ordered[index - 1].target.end,
        )
    ) {
        return conflict('Planned target ranges overlap');
    }
    return {ok: true, changes};
}
