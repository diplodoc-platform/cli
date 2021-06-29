import {Platforms} from '../constants';

const windowsSlash = '\\';
const linuxSlash = '/';

export function addSlashPrefix(path: string): string {
    const slashPrefix = process.platform === Platforms.WINDOWS
        ? path.startsWith(windowsSlash) ? '' : windowsSlash
        : path.startsWith(linuxSlash) ? '' : linuxSlash;

    return `${slashPrefix}${path}`;
}

export function convertBackSlashToSlash(path: string): string {
    if (process.platform === Platforms.WINDOWS) {
        return path.replace(/\\/g, linuxSlash);
    }

    return path;
}
