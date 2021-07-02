import {sep} from 'path';
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
