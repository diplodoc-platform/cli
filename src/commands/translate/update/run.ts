import type {Snapshot, UpdateDiagnostic} from './types';
import type {PlannedChange} from './plan';

import {extract} from '../utils/translate';

import {protectedPattern, tokenKind} from './protected';
import {planUpdate} from './plan';
import {applyTargetEdits} from './apply';
import {blockShape, extractRawBlocks} from './ranges';
export type FragmentRequest = {
    path?: string;
    sourceBefore: string;
    sourceAfter: string;
    previousTranslation: string;
    contextBefore: string;
    contextAfter: string;
};
export type FragmentResult = {text: string; diagnostics: UpdateDiagnostic[]};
export type FragmentTranslator = (request: FragmentRequest) => Promise<FragmentResult>;
export type UpdateResult = {
    output: string | null;
    planned: number;
    applied: number;
    rejected: number;
    diagnostics: UpdateDiagnostic[];
};
function tokens(text: string): string[] {
    return text.match(protectedPattern) ?? [];
}
function localize(change: PlannedChange): string {
    const before = tokens(change.sourceBefore);
    const target = tokens(change.previousTranslation);
    if (!change.sourceBefore || !change.sourceAfter) {
        return change.sourceAfter;
    }
    if (before.length !== target.length) {
        throw new Error(
            'Protected inline structure changed or has no unique target correspondence',
        );
    }
    if (
        before.some(
            (token, index) =>
                tokenKind(token) !== tokenKind(target[index]) ||
                (before.filter((other) => tokenKind(other) === tokenKind(token)).length > 1 &&
                    token !== target[index]),
        )
    ) {
        throw new Error('Localized inline pieces are reordered or have ambiguous correspondence');
    }
    return change.sourceAfter.replace(protectedPattern, (token) => {
        const index = before.indexOf(token);
        return index < 0 ? token : target[index];
    });
}
function withInsertionSeparator(
    change: PlannedChange,
    replacement: string,
    target: string,
): string {
    if (!change.insertion) return replacement;
    const newline = target.includes('\r\n') ? '\r\n' : '\n';
    const separator = (change.separator ?? '\n\n').replace(/\n/g, newline);
    return change.insertionSide === 'after'
        ? `${separator}${replacement}`
        : `${replacement}${separator}`;
}
/** Translate only authorized ranges; independent failed fragments remain unchanged and are reported. */
export async function runUpdate(
    snapshot: Snapshot,
    translate: FragmentTranslator,
): Promise<UpdateResult> {
    const plan = planUpdate(snapshot);
    if (!plan.ok) {
        return {output: null, planned: 0, applied: 0, rejected: 1, diagnostics: [plan.diagnostic]};
    }
    const count = plan.changes.length + (plan.rejected ?? 0);
    const diagnostics = [...(plan.diagnostics ?? [])];
    let rejected = plan.rejected ?? 0;
    const edits = [];
    for (const change of plan.changes) {
        const diagnosticStart = diagnostics.length;
        try {
            if (change.literalOutput !== undefined) {
                edits.push({
                    ...change.target,
                    expected: change.expected,
                    replacement: withInsertionSeparator(
                        change,
                        change.literalOutput,
                        snapshot.targetBefore!,
                    ),
                });
                continue;
            }
            if (change.sourceBefore) {
                const options = {
                    compact: true,
                    unitLocalIds: true,
                    source: {language: snapshot.entry.sourcePath.split('/')[0], locale: 'RU'},
                    target: {language: snapshot.entry.targetPath.split('/')[0], locale: 'US'},
                };
                const before = extract(change.sourceBefore, options),
                    target = extract(change.previousTranslation, options);
                if (
                    before.warnings.length ||
                    target.warnings.length ||
                    before.units.length !== target.units.length
                ) {
                    diagnostics.push({
                        code: 'target_alignment_conflict',
                        message:
                            'Source and target paragraph units differ; target-only explanations cannot be safely replaced',
                    });
                    rejected++;
                    continue;
                }
            }
            const sourceAfter = localize(change);
            const result = sourceAfter
                ? await translate({...change, sourceAfter, path: snapshot.entry.sourcePath})
                : {text: '', diagnostics: []};
            if (result.diagnostics.length) {
                diagnostics.push(...result.diagnostics);
                rejected++;
                continue;
            }
            const blocks = extractRawBlocks(result.text),
                expected = extractRawBlocks(sourceAfter);
            if (
                sourceAfter &&
                (blocks.length !== expected.length ||
                    blocks.some(
                        (block, index) =>
                            blockShape(block) !== blockShape(expected[index]) ||
                            (block.kind === 'opaque' && block.text !== expected[index].text) ||
                            JSON.stringify(block.container) !==
                                JSON.stringify(expected[index].container),
                    ) ||
                    result.text.trim() !== result.text ||
                    JSON.stringify(tokens(result.text)) !== JSON.stringify(tokens(sourceAfter)))
            ) {
                diagnostics.push({
                    code: 'invalid_output',
                    message: 'Translated fragment changed its protected structure',
                });
                rejected++;
                continue;
            }
            const replacement = withInsertionSeparator(change, result.text, snapshot.targetBefore!);
            edits.push({...change.target, expected: change.expected, replacement});
        } catch (error) {
            diagnostics.push({
                code: 'invalid_output',
                message: error instanceof Error ? error.message : String(error),
            });
            rejected++;
        } finally {
            for (let index = diagnosticStart; index < diagnostics.length; index++) {
                diagnostics[index] = {
                    ...diagnostics[index],
                    message: `Source line ${change.sourceLine}: ${diagnostics[index].message}`,
                };
            }
        }
    }
    try {
        return {
            output:
                edits.length || !rejected ? applyTargetEdits(snapshot.targetBefore!, edits) : null,
            planned: count,
            applied: edits.length,
            rejected,
            diagnostics,
        };
    } catch (error) {
        return {
            output: null,
            planned: count,
            applied: 0,
            rejected: count,
            diagnostics: [
                {
                    code: 'invalid_output',
                    message: error instanceof Error ? error.message : String(error),
                },
            ],
        };
    }
}
