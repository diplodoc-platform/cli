import {sep} from 'node:path';

export function addSlashPrefix(path: string): string {
    const slashPrefix = path.startsWith(sep) ? '' : sep;

    return `${slashPrefix}${path}`;
}

export function getDepth(path: string) {
    return path
        .replace(/\\/g, '/')
        .replace(/^\.\/|\/$/g, '')
        .split('/').length;
}

export function getDepthPath(depth: number) {
    return Array(depth).fill('../').join('') || './';
}
