import {resolve} from 'path';
import {readFile, stat, writeFile} from 'node:fs/promises';
import {logger} from './logger';
import {Queue} from './queue';

const FILE_META_NAME = '.revision.meta.json';

export interface RevisionMeta {
    files: {
        [key: string]: {
            mod_date: number;
            files: string[];
            vars: string[];
        };
    };
}

export async function makeMetaFile(
    userOutputFolder: string,
    outputFolderPath: string,
    files: string[],
    currentMeta: RevisionMeta | undefined | null,
) { 
    const meta: RevisionMeta['files'] = {};

    const queue = new Queue(async (pathToAsset: string) => {
        const from = resolve(outputFolderPath, pathToAsset);

        try {
            const data = await stat(from);
        
            meta[pathToAsset] = {
                mod_date: Number(data.mtime),
                files: currentMeta?.files?.[pathToAsset]?.files || [],
                vars: currentMeta?.files?.[pathToAsset]?.vars || [],
            };
        } catch (error) {
            // ignore
        }

    }, 50, (error, pathToAsset) => logger.error(pathToAsset, error.message));

    files.forEach(queue.add);

    await queue.loop();

    const outputFile = resolve(userOutputFolder, FILE_META_NAME);

    await writeFile(outputFile, JSON.stringify({
        files: meta,
    }, null, 4), { encoding: 'utf8' });
}

export async function getMetaFile(userOutputFolder: string): Promise<RevisionMeta | null> {
    const outputFile = resolve(userOutputFolder, FILE_META_NAME);

    try {
        return JSON.parse(await readFile(outputFile, 'utf8'));
    } catch (_) {
        return null;
    }
}
