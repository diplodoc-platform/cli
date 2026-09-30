import type {Snapshot, UpdateDiagnostic} from './types';
import type {RawRange} from './apply';
import type {RawBlock} from './ranges';

import {normalizeProseWhitespace} from './protected';
import {balancedContainers, blockShape, extractRawBlocks} from './ranges';
import {patchInclude, patchLinks, patchLiteralLines, patchTableNumber} from './raw-patch';
import {correspond, unchangedBlocks} from './correspondence';
import {planTabSelections} from './tab-selection';
export type PlannedChange = {
    target: RawRange;
    sourceLine: number;
    expected: string;
    sourceBefore: string;
    sourceAfter: string;
    previousTranslation: string;
    contextBefore: string;
    contextAfter: string;
    insertion?: boolean;
    insertionSide?: 'before' | 'after';
    separator?: string;
    literalOutput?: string;
};
export type UpdatePlan =
    | {ok: true; changes: PlannedChange[]; diagnostics?: UpdateDiagnostic[]; rejected?: number}
    | {ok: false; diagnostic: UpdateDiagnostic};
const conflict = (
    message: string,
    code: UpdateDiagnostic['code'] = 'target_alignment_conflict',
): UpdatePlan => ({ok: false, diagnostic: {code, message}});

function conditionalIdentity(text: string): string | null {
    const directives = [...text.matchAll(/{%\s*(?:if|else|elif|endif)\b[^%]*%}/g)].map((m) => m[0]);
    const links = [...text.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
    return directives.length && links.length ? JSON.stringify({directives, links}) : null;
}

function isLiteralConditionalLink(text: string): boolean {
    return /^\s*{%\s*if\b[^%]*%}\s*[-*+]\s+\[\{#T\}\]\([^)]+\)\s*{%\s*endif\s*%}\s*$/.test(text);
}

/** Plan source deltas only; the model never decides which target spans may change. */
export function planUpdate(snapshot: Snapshot): UpdatePlan {
    if (snapshot.sourceBefore === null || snapshot.targetBefore === null) {
        return conflict('Update requires existing source and target snapshots', 'missing_target');
    }
    if (snapshot.sourceBefore === snapshot.sourceAfter) {
        return {ok: true, changes: []};
    }
    const tabSelections = planTabSelections(
        snapshot.sourceBefore,
        snapshot.sourceAfter,
        snapshot.targetBefore,
    );
    if (tabSelections) return {ok: true, changes: tabSelections};
    const before = extractRawBlocks(snapshot.sourceBefore);
    const after = extractRawBlocks(snapshot.sourceAfter);
    const target = extractRawBlocks(snapshot.targetBefore);
    const mapping = correspond(before, target);
    const map = (index: number) => mapping.get(index) ?? -1;
    const unchanged = unchangedBlocks(before, after);
    const changes: PlannedChange[] = [];
    const diagnostics: UpdateDiagnostic[] = [];
    let rejected = 0;
    const matches = [{old: -1, next: -1}, ...unchanged, {old: before.length, next: after.length}];
    const replacement = (oldIndex: number, nextIndex: number | null): UpdatePlan | null => {
        const old = before[oldIndex],
            updated = nextIndex === null ? undefined : after[nextIndex];

        if (normalizeProseWhitespace(old.text) === normalizeProseWhitespace(updated?.text ?? ''))
            return null;
        const mapped = map(oldIndex);
        if (mapped < 0) return conflict('Changed block has no unique target correspondence');
        if (before.filter((block) => block.text === old.text).length > 1 && !old.anchors.length)
            return conflict('Repeated changed source block has no unique identity');
        const block = target[mapped];
        let literalOutput: string | undefined;
        const links = updated ? patchLinks(old.text, updated.text, block.text) : null;
        if (links && links.output === undefined)
            return conflict('Changed link destination diverged in the target');
        literalOutput = links?.output;
        if (
            updated &&
            old.kind === 'table' &&
            block.kind === 'table' &&
            literalOutput === undefined
        ) {
            const number = patchTableNumber(old.text, updated.text, block.text);
            if (number && number.output === undefined)
                return conflict('Changed table number diverged in the target');
            literalOutput = number?.output;
        }
        if (old.kind === 'marker' && !/{%\s*include\b/.test(old.text))
            return conflict(
                'Container delimiters cannot be edited independently',
                'unsupported_structure',
            );
        if (updated && old.kind === 'opaque' && /^(?:---\r?\n|\s*`{3,}|\s*~{3,})/.test(old.text))
            literalOutput = patchLiteralLines(old.text, updated.text, block.text);
        if (updated && old.kind === 'marker' && /{%\s*include\b/.test(old.text))
            literalOutput = patchInclude(old.text, updated.text, block.text);
        if (!updated && old.kind === 'opaque' && old.text === block.text) literalOutput = '';
        if ((old.kind === 'opaque' || block.kind === 'opaque') && literalOutput === undefined)
            return conflict('Target container cannot be replaced safely', 'unsupported_structure');
        if (updated && blockShape(old) !== blockShape(updated))
            return conflict('Changed block structure requires explicit correspondence');
        changes.push({
            target: {start: block.start, end: block.end},
            sourceLine: snapshot.sourceBefore!.slice(0, old.start).split(/\r?\n/).length,
            expected: block.text,
            sourceBefore: old.text,
            sourceAfter: updated?.text ?? '',
            previousTranslation: block.text,
            contextBefore: '',
            contextAfter: '',
            literalOutput,
        });
        return null;
    };
    const insertion = (added: RawBlock[], oldLeft: number, oldRight: number): UpdatePlan | null => {
        if (!added.length) return null;
        if (!balancedContainers(added.map((block) => block.text).join('\n')))
            return conflict(
                'Container insertion must be complete and balanced',
                'unsupported_structure',
            );
        const conditional = added.find(
            (block) => block.kind === 'opaque' && /{%\s*if\b/.test(block.text),
        );
        if (conditional) {
            if (added.length !== 1)
                return conflict(
                    'Conditional insertion must be a single block',
                    'unsupported_structure',
                );
            const identity = conditionalIdentity(conditional.text);
            if (identity && !before.some((block) => conditionalIdentity(block.text) === identity)) {
                const candidates = target.flatMap((block, index) =>
                    block.kind === 'opaque' && conditionalIdentity(block.text) === identity
                        ? [index]
                        : [],
                );
                const left =
                    [...mapping]
                        .filter(([old]) => old <= oldLeft)
                        .sort((a, b) => b[0] - a[0])[0]?.[1] ?? -1;
                const right =
                    [...mapping]
                        .filter(([old]) => old >= oldRight)
                        .sort((a, b) => a[0] - b[0])[0]?.[1] ?? target.length;
                if (candidates.length === 1 && left < candidates[0] && candidates[0] < right)
                    return null;
                if (candidates.length)
                    return conflict('Conditional link has ambiguous target correspondence');
            }
            if (!isLiteralConditionalLink(conditional.text))
                return conflict(
                    'Conditional insertion requires an audience-aware mapping',
                    'unsupported_structure',
                );
        }
        const previous = map(oldLeft),
            next = map(oldRight);
        const wholeSection = added[0].kind === 'heading' || /^\s*{%\s*cut\b/.test(added[0].text);
        if (previous < 0 && next < 0) return conflict('Insertion has no mapped boundary');
        if (previous >= 0 && next >= 0 && next !== previous + 1)
            return conflict('Insertion boundary contains target-only blocks');
        const nextMapped = [...mapping]
            .filter(([old]) => old >= oldRight)
            .sort((a, b) => a[0] - b[0])[0]?.[1];
        const omittedSourceBoundary = Boolean(
            conditional && previous >= 0 && next < 0 && nextMapped === previous + 1,
        );
        if (
            (previous < 0 || next < 0) &&
            !wholeSection &&
            !omittedSourceBoundary &&
            oldLeft >= 0 &&
            oldRight < before.length
        )
            return conflict('Insertion boundary is missing');
        const side = next >= 0 ? 'before' : 'after';
        const start = next >= 0 ? target[next].start : target[previous].end;
        const raw = snapshot.sourceAfter.slice(added[0].start, added[added.length - 1].end);
        changes.push({
            target: {start, end: start},
            sourceLine: snapshot.sourceAfter.slice(0, added[0].start).split(/\r?\n/).length,
            expected: '',
            sourceBefore: '',
            sourceAfter: raw,
            previousTranslation: '',
            contextBefore: '',
            contextAfter: '',
            insertion: true,
            insertionSide: side,
            separator: added.every((b) => b.kind === 'table' || b.kind === 'list') ? '\n' : '\n\n',
            literalOutput: conditional ? raw : undefined,
        });
        return null;
    };
    const record = (failure: UpdatePlan | null) => {
        if (failure && !failure.ok) {
            diagnostics.push(failure.diagnostic);
            rejected++;
        }
    };
    for (let index = 1; index < matches.length; index++) {
        const left = matches[index - 1],
            right = matches[index];
        const removed = before.slice(left.old + 1, right.old),
            added = after.slice(left.next + 1, right.next);
        if (!removed.length && !added.length) continue;
        const diagnosticStart = diagnostics.length;
        const sourceOffset = removed[0]?.start ?? snapshot.sourceBefore.length;
        const sourceLine = snapshot.sourceBefore.slice(0, sourceOffset).split(/\r?\n/).length;
        if (!removed.length) record(insertion(added, left.old, right.old));
        else if (!added.length && removed.some((block) => block.kind === 'marker'))
            record(
                conflict(
                    'Container removal requires a complete target correspondence',
                    'unsupported_structure',
                ),
            );
        else if (!added.length) {
            for (let offset = 0; offset < removed.length; offset++)
                record(replacement(left.old + 1 + offset, null));
        } else if (removed.length === added.length) {
            for (let offset = 0; offset < removed.length; offset++)
                record(replacement(left.old + 1 + offset, left.next + 1 + offset));
        } else if (
            removed.length === 1 &&
            removed[0].kind === 'heading' &&
            added[0].kind === 'heading'
        ) {
            record(replacement(left.old + 1, left.next + 1));
            record(insertion(added.slice(1), left.old + 1, right.old));
        } else record(conflict('Multiple block repartitioning requires explicit correspondence'));
        for (let offset = diagnosticStart; offset < diagnostics.length; offset++) {
            diagnostics[offset] = {
                ...diagnostics[offset],
                message: `Source line ${sourceLine}: ${diagnostics[offset].message}`,
            };
        }
    }
    const ordered = [...changes].sort((a, b) => a.target.start - b.target.start);
    if (
        ordered.some(
            (change, index) => index > 0 && change.target.start < ordered[index - 1].target.end,
        )
    ) {
        return conflict('Planned target ranges overlap');
    }
    if (!changes.length && diagnostics.length) return {ok: false, diagnostic: diagnostics[0]};
    return diagnostics.length ? {ok: true, changes, diagnostics, rejected} : {ok: true, changes};
}
