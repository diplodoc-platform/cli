import {normalize} from 'node:path';

export function normalizePath(path: string): NormalizedPath {
    return normalize(path).replace(/\\/g, '/') as NormalizedPath;
}
