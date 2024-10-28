import {resolve} from 'path';
import {readFile, stat, unlink, writeFile} from 'node:fs/promises';
import {logger} from './logger';
import {Queue} from './queue';
import {RevisionMeta} from '@diplodoc/transform/lib/typings';

const FILE_META_NAME = '.revision.meta.json';
const META_ACTIVE_QUEUE_LENGTH = 50;

export async function makeMetaFile(userOutputFolder: string, files: string[], meta: RevisionMeta) {
    if (meta.files) {
        for (const file of Object.keys(meta.files)) {
            if (!files.includes(file)) {
                delete meta.files[file];
            }
        }
    }

    const outputFile = resolve(userOutputFolder, FILE_META_NAME);

    try {
        await unlink(outputFile);
    } catch (error) {
        // ignore
    }

    await writeFile(outputFile, JSON.stringify(meta, null, 4), {encoding: 'utf8'});
}

export async function getMetaFile(userOutputFolder: string): Promise<RevisionMeta | null> {
    const outputFile = resolve(userOutputFolder, FILE_META_NAME);

    try {
        return JSON.parse(await readFile(outputFile, 'utf8'));
    } catch (_) {
        return null;
    }
}

export async function updateMetaFile(
    cached: boolean,
    outputFolderPath: string,
    metaFiles: RevisionMeta['files'],
    files: string[],
) {
    if (files.length) {
        const queue = new Queue(
            async (pathToAsset: string) => {
                const from = resolve(outputFolderPath, pathToAsset);

                try {
                    const changed = !cached || !metaFiles[pathToAsset];
                    const modDate = Number((await stat(from)).mtime);
                    metaFiles[pathToAsset] = {
                        modifyedDate: changed
                            ? modDate
                            : (metaFiles[pathToAsset]?.modifyedDate ?? modDate),
                        dependencies: metaFiles[pathToAsset]?.dependencies || {},
                        changed,
                    };
                } catch (error) {
                    // ignore
                }
            },
            META_ACTIVE_QUEUE_LENGTH,
            (error, pathToAsset) => logger.error(pathToAsset, error.message),
        );

        files.forEach(queue.add);

        await queue.loop();
    }
}

export async function updateChangedMetaFile(
    cached: boolean,
    inputFolderPath: string,
    metaFiles: RevisionMeta['files'],
) {
    const files = Object.keys(metaFiles);

    if (files.length) {
        const queue = new Queue(
            async (pathToAsset: string) => {
                if (metaFiles[pathToAsset] && !metaFiles[pathToAsset].changed) {
                    const from = resolve(inputFolderPath, pathToAsset);
                    const modDateNullable = await getFileModifiedDate(from);
                    const modDate = modDateNullable ?? metaFiles[pathToAsset].modifyedDate;

                    metaFiles[pathToAsset].changed =
                        !cached ||
                        !modDateNullable ||
                        isFileModified(modDate, metaFiles[pathToAsset].modifyedDate);
                    metaFiles[pathToAsset].modifyedDate = modDate;
                }
            },
            META_ACTIVE_QUEUE_LENGTH,
            (error, pathToAsset) => logger.error(pathToAsset, error.message),
        );

        files.forEach(queue.add);

        await queue.loop();
    }
}

async function getFileModifiedDate(from: string) {
    try {
        const data = await stat(from);
        const folderLMM = Number(data.mtime);
        return folderLMM;
    } catch (_) {
        return null;
    }
}

function isFileModified(newModDate: number, oldModDate: number) {
    return Math.abs(newModDate - oldModDate) > 1000;
}
