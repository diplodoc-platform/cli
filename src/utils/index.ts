export function getDepth(path: string) {
    return path
        .replace(/\\/g, '/')
        .replace(/^\.\/|\/$/g, '')
        .split('/').length;
}

export function getDepthPath(depth: number) {
    return Array(depth).fill('../').join('') || './';
}
