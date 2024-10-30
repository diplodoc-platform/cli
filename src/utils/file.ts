import {dirname, resolve} from 'path';
import {copyFile} from 'node:fs/promises';
import shell from 'shelljs';
import walkSync from 'walk-sync';
import {RevisionMeta} from '@diplodoc/transform/lib/typings';
import {logger} from './logger';
import {Queue} from './queue';

const COPY_FILES_ACTIVE_QUEUE_LENGTH = 50;

export async function copyFiles(
    inputFolderPath: string,
    outputFolderPath: string,
    files: string[],
    meta?: RevisionMeta | null,
) {
    if (files.length === 0) {
        return;
    }

    const dirs = new Set<string>();

    const queue = new Queue(
        async (pathToAsset: string) => {
            const from = resolve(inputFolderPath, pathToAsset);
            const to = resolve(outputFolderPath, pathToAsset);
            const isChanged = meta?.files?.[pathToAsset]?.changed !== false;

            if (isChanged) {
                const outputDir = resolve(outputFolderPath, dirname(pathToAsset));

                if (!dirs.has(outputDir)) {
                    dirs.add(outputDir);
                    shell.mkdir('-p', outputDir);
                }

                await copyFile(from, to);
                logger.copy(pathToAsset);
            }
        },
        COPY_FILES_ACTIVE_QUEUE_LENGTH,
        (error, pathToAsset) => logger.error(pathToAsset, error.message),
    );

    files.forEach(queue.add);
    await queue.loop();
}

export function walk({
    folder,
    globs,
    ignore,
    directories,
    includeBasePath,
}: {
    folder?: string | string[];
    globs?: string[];
    ignore?: string[];
    directories?: boolean;
    includeBasePath?: boolean;
}) {
    if (!Array.isArray(folder) && folder) {
        folder = [folder];
    }

    const dirs = [...(folder || [])].filter(Boolean) as string[];
    const files = dirs.map<string[]>((folder) =>
        walkSync(folder as string, {
            directories,
            includeBasePath,
            globs,
            ignore,
        }),
    );

    return [...new Set(files.flat())];
}
