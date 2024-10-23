import {readFileSync, statSync, writeFileSync} from 'fs';
import {readFile, stat, writeFile} from 'fs/promises';
import {resolve} from 'path';
import {FsContext} from '@diplodoc/transform/lib/typings';
import {RevisionContext} from './context';

export function isFileExists(file: string) {
    try {
        const stats = statSync(file);

        return stats.isFile();
    } catch (e) {
        return false;
    }
}

export async function isFileExistsAsync(file: string) {
    try {
        const stats = await stat(file);

        return stats.isFile();
    } catch (e) {
        return false;
    }
}

export class FsContextCli implements FsContext {
    private context: RevisionContext;

    constructor(context: RevisionContext) {
        this.context = context;
    }

    getPaths(path: string) {
        const arr = [path];

        const isFromTmpInputFolder = path.startsWith(resolve(this.context.tmpInputFolder) + '/');
        if (isFromTmpInputFolder) {
            const assetPath = path.replace(resolve(this.context.tmpInputFolder) + '/', '');
            const originPath = resolve(this.context.userInputFolder, assetPath);

            arr.unshift(originPath);
        }

        return arr;
    }

    exist(path: string): boolean {
        const paths = this.getPaths(path);

        for (const path of paths) {
            if (isFileExists(path)) {
                return true;
            }
        }

        return false;
    }

    read(path: string): string {
        const paths = this.getPaths(path);

        for (const path of paths) {
            if (isFileExists(path)) {
                return readFileSync(path, 'utf8');
            }
        }

        throw Error(`File has not been found at: ${path}`);
    }

    write(path: string, content: string): void {
        writeFileSync(path, content, {
            encoding: 'utf8',
        });
    }

    async existAsync(path: string): Promise<boolean> {
        const paths = this.getPaths(path);

        for (const path of paths) {
            if (await isFileExistsAsync(path)) {
                return true;
            }
        }

        return false;
    }

    async readAsync(path: string): Promise<string> {
        const paths = this.getPaths(path);

        for (const path of paths) {
            if (await isFileExistsAsync(path)) {
                return await readFile(path, 'utf8');
            }
        }

        throw Error(`File has not been found at: ${path}`);
    }

    async writeAsync(path: string, content: string): Promise<void> {
        await writeFile(path, content, {
            encoding: 'utf8',
        });
    }
}
