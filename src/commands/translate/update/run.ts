import type {Snapshot, UpdateDiagnostic} from './types';
import type {PlannedChange} from './plan';

import {extract} from '../utils/translate';

import {protectedPattern, tokenKind} from './protected';
import {planUpdate} from './plan';
import {applyTargetEdits} from './apply';
import {extractRawBlocks} from './ranges';
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
function tokens(text: string) {
    return text.match(protectedPattern) ?? [];
}
function localize(change: PlannedChange): string {
    const before = tokens(change.sourceBefore);
    const after = tokens(change.sourceAfter);
    const target = tokens(change.previousTranslation);
    if (!change.sourceBefore || !change.sourceAfter) {
        return change.sourceAfter;
    }
    if (JSON.stringify(before) !== JSON.stringify(after) || before.length !== target.length) {
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
    let index = 0;
    return change.sourceAfter.replace(protectedPattern, () => target[index++]);
}
/** Translate only authorized ranges; any failed fragment rejects the complete file. */
export async function runUpdate(
    snapshot: Snapshot,
    translate: FragmentTranslator,
): Promise<UpdateResult> {
    const plan = planUpdate(snapshot);
    if (!plan.ok) {
        return {output: null, planned: 0, applied: 0, rejected: 1, diagnostics: [plan.diagnostic]};
    }
    const count = plan.changes.length;
    const reject = (diagnostics: UpdateDiagnostic[]): UpdateResult => ({
        output: null,
        planned: count,
        applied: 0,
        rejected: count,
        diagnostics,
    });
    try {
        for (const change of plan.changes) {
            if (!change.sourceBefore) continue;
            const options = {
                compact: true,
                unitLocalIds: true,
                source: {language: snapshot.entry.sourcePath.split('/')[0], locale: 'RU'},
                target: {language: snapshot.entry.targetPath.split('/')[0], locale: 'US'},
            };
            const before = extract(change.sourceBefore, options);
            const target = extract(change.previousTranslation, options);
            if (
                before.warnings.length ||
                target.warnings.length ||
                before.units.length !== target.units.length
            ) {
                return reject([
                    {
                        code: 'target_alignment_conflict',
                        message:
                            'Source and target paragraph units differ; target-only explanations cannot be safely replaced',
                    },
                ]);
            }
        }
        // Validate every correspondence before starting provider work.
        const localized = plan.changes.map(localize);
        const edits = [];
        for (const [index, change] of plan.changes.entries()) {
            const sourceAfter = localized[index];
            const result = sourceAfter
                ? await translate({...change, sourceAfter, path: snapshot.entry.sourcePath})
                : {text: '', diagnostics: []};
            if (result.diagnostics.length) {
                return reject(result.diagnostics);
            }
            const blocks = extractRawBlocks(result.text);
            const expected = extractRawBlocks(sourceAfter);
            if (
                sourceAfter &&
                (blocks.length !== 1 ||
                    blocks[0].kind === 'opaque' ||
                    blocks[0].kind !== expected[0]?.kind ||
                    result.text.trim() !== result.text ||
                    JSON.stringify(tokens(result.text)) !== JSON.stringify(tokens(sourceAfter)))
            ) {
                return reject([
                    {
                        code: 'invalid_output',
                        message: 'Translated fragment changed its protected structure',
                    },
                ]);
            }
            let replacement = result.text;
            if (change.insertion) {
                const newline = snapshot.targetBefore!.includes('\r\n') ? '\r\n' : '\n';
                const atEnd = change.target.start === snapshot.targetBefore!.length;
                replacement = atEnd
                    ? `${snapshot.targetBefore!.endsWith(newline + newline) ? '' : newline + newline}${replacement}`
                    : `${replacement}${newline}${newline}`;
            }
            edits.push({...change.target, expected: change.expected, replacement});
        }
        return {
            output: applyTargetEdits(snapshot.targetBefore!, edits),
            planned: count,
            applied: count,
            rejected: 0,
            diagnostics: [],
        };
    } catch (error) {
        return reject([
            {
                code: 'invalid_output',
                message: error instanceof Error ? error.message : String(error),
            },
        ]);
    }
}
