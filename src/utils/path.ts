import {sep, normalize} from 'path';
import {Platforms} from '../constants';

export function addSlashPrefix(path: string): string {
    const slashPrefix = path.startsWith(sep) ? '' : sep;

    return `${slashPrefix}${path}`;
}

export function convertBackSlashToSlash(path: string): string {
    if (process.platform === Platforms.WINDOWS) {
        return path.replace(/\\/g, '/');
    }

    return path;
}

export function convertSlashToWindowsBackSlashes(path: string): string {
    if (process.platform === Platforms.WINDOWS) {
        return path.replace(/\//g, '\\\\');
    }

    return path;
}

export function safeRelativePath(filename: string) {
    return normalize(`/${filename}`).slice(1);
}
