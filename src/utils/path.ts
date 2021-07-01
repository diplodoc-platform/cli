import {Platforms} from '../constants';

const backSlash = '\\';
const slash = '/';

export function addSlashPrefix(path: string): string {
    const slashPrefix = process.platform === Platforms.WINDOWS
        ? path.startsWith(backSlash) ? '' : backSlash
        : path.startsWith(slash) ? '' : slash;

    return `${slashPrefix}${path}`;
}

export function convertBackSlashToSlash(path: string): string {
    if (process.platform === Platforms.WINDOWS) {
        return path.replace(/\\/g, slash);
    }

    return path;
}
