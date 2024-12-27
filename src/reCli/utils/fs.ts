import path from 'node:path';
import fs from 'node:fs';

export function safePath(filepath: string) {
    return path.normalize(`/${filepath}`).slice(1);
}

const MKDIR_CACHE = new Set<string>();
const INFLIGHT_CACHE = new Map<string, Promise<void>>();

export async function cachedMkdir(place: string) {
    if (MKDIR_CACHE.has(place)) return undefined;
    let promise = INFLIGHT_CACHE.get(place);
    if (!promise) {
        promise = fs.promises
            .mkdir(place, {recursive: true})
            .then(() => {
                MKDIR_CACHE.add(place);
            })
            .finally(() => {
                INFLIGHT_CACHE.delete(place);
            });
        INFLIGHT_CACHE.set(place, promise);
    }
    return promise;
}

export function cachedMkdirSync(place: string) {
    if (MKDIR_CACHE.has(place)) return;
    fs.mkdirSync(place, {recursive: true});
    MKDIR_CACHE.add(place);
}

export async function fileExists(filepath: string) {
    try {
        await fs.promises.stat(filepath);
        return true;
    } catch (err) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}
