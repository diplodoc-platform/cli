import type {Snapshot} from './types';
import type {FragmentTranslator, UpdateResult} from './run';

import {readFileSync, renameSync} from 'node:fs';
import {link, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';

import {checkOutputPath} from './manifest';
import {planUpdate} from './plan';
import {runUpdate} from './run';
export type FileUpdateResult = Omit<UpdateResult, 'output'> & {path: string};
function checkFreshness(path: string, snapshot: Snapshot): void {
    let existing: Buffer;
    try {
        existing = readFileSync(path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
    }
    if (snapshot.entry.kind === 'create') throw new Error('Create target already exists');
    if (!existing.equals(Buffer.from(snapshot.targetBefore ?? '', 'utf8')))
        throw new Error('Target changed after the snapshot; refusing stale output');
}
async function inputTarget(snapshot: Snapshot): Promise<string | undefined> {
    return snapshot.inputRoot
        ? checkOutputPath(snapshot.inputRoot, snapshot.entry.targetPath)
        : undefined;
}
/** Execute isolated file plans and atomically publish successful outputs. */
export async function executeUpdates(
    snapshots: Snapshot[],
    outputRoot: string,
    dryRun: boolean,
    translate: FragmentTranslator,
    create?: (snapshot: Snapshot) => Promise<string>,
): Promise<FileUpdateResult[]> {
    const results: FileUpdateResult[] = [];
    for (const snapshot of snapshots) {
        let result: UpdateResult;
        try {
            const existingInput = await inputTarget(snapshot);
            if (existingInput) checkFreshness(existingInput, snapshot);
            checkFreshness(await checkOutputPath(outputRoot, snapshot.entry.targetPath), snapshot);
            if (snapshot.entry.kind === 'create') {
                if (!create) {
                    throw new Error('Provider does not support creating translated files');
                }
                result = {
                    output: dryRun ? null : await create(snapshot),
                    planned: 1,
                    applied: dryRun ? 0 : 1,
                    rejected: 0,
                    diagnostics: [],
                };
            } else if (dryRun) {
                const plan = planUpdate(snapshot);
                result = {
                    output: null,
                    planned: plan.ok ? plan.changes.length + (plan.rejected ?? 0) : 0,
                    applied: 0,
                    rejected: plan.ok ? (plan.rejected ?? 0) : 1,
                    diagnostics: plan.ok ? (plan.diagnostics ?? []) : [plan.diagnostic],
                };
            } else {
                result = await runUpdate(snapshot, translate);
            }
            if (result.output !== null && !dryRun) {
                const output = await checkOutputPath(outputRoot, snapshot.entry.targetPath);
                await mkdir(dirname(output), {recursive: true});
                await checkOutputPath(outputRoot, snapshot.entry.targetPath);
                const directory = await mkdtemp(join(dirname(output), '.translate-update-'));
                try {
                    const temporary = join(directory, 'content');
                    await writeFile(temporary, result.output, 'utf8');
                    await checkOutputPath(outputRoot, snapshot.entry.targetPath);
                    const currentInput = await inputTarget(snapshot);
                    if (currentInput) checkFreshness(currentInput, snapshot);
                    checkFreshness(output, snapshot);
                    if (snapshot.entry.kind === 'create') await link(temporary, output);
                    else renameSync(temporary, output);
                } finally {
                    await rm(directory, {recursive: true, force: true});
                }
            }
        } catch (error) {
            result = {
                output: null,
                planned: 0,
                applied: 0,
                rejected: 1,
                diagnostics: [
                    {
                        code: 'invalid_output',
                        message: error instanceof Error ? error.message : String(error),
                    },
                ],
            };
        }
        const {output: _output, ...details} = result;
        results.push({path: snapshot.entry.sourcePath, ...details});
    }
    return results;
}
