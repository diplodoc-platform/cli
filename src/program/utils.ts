export function isRelative(path: string) {
    return Boolean(path.match(/^\.{1,2}\/.+$/));
}

export class HandledError extends Error {}
