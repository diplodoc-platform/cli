import {lstat, lutimes, mkdir, readlink, realpath, symlink} from 'fs/promises';
import {basename, dirname, isAbsolute, join, relative, resolve} from 'node:path';

type SourceLink = {source: string; target: string; resolved: string};

/** Preserve needed link nodes and terminal targets without traversing whole target directories. */
export async function planSources(paths: string[]) {
    const files = new Set<string>();
    const directories = new Set<string>();
    const links: SourceLink[] = [];
    const seen = new Set<string>();
    const add = async (path: string): Promise<void> => {
        if (seen.has(path)) return;
        seen.add(path);
        const parents: string[] = [];
        for (let parent = dirname(path); dirname(parent) !== parent; parent = dirname(parent))
            parents.unshift(parent);
        for (const parent of parents) {
            if ((await lstat(parent)).isSymbolicLink()) {
                await add(parent);
                await add(join(await realpath(dirname(path)), basename(path)));
                return;
            }
        }
        const info = await lstat(path);
        if (info.isSymbolicLink()) {
            const target = await readlink(path);
            if (isAbsolute(target))
                throw new Error(
                    `Cannot relocate an observed absolute symlink; use a relative target: ${path}`,
                );
            let resolved: string;
            try {
                resolved = await realpath(path);
            } catch {
                throw new Error(`Cannot relocate an observed dangling or cyclic symlink: ${path}`);
            }
            links.push({source: path, target, resolved});
            await add(resolve(dirname(path), target));
        } else if (info.isDirectory()) directories.add(path);
        else if (info.isFile()) files.add(path);
        else throw new Error(`Unsupported documentation source file: ${path}`);
    };
    for (const path of paths) await add(path);
    return {files: [...files], directories: [...directories], links};
}

/** Create original relative links after their required terminal targets have been packed. */
export async function createLinks(links: SourceLink[], root: string, destination: string) {
    for (const link of links) {
        const target = join(destination, relative(root, link.source));
        await mkdir(dirname(target), {recursive: true});
        await symlink(link.target, target);
        const info = await lstat(link.source);
        await lutimes(target, info.atime, info.mtime);
    }
    for (const link of links) {
        const path = join(destination, relative(root, link.source));
        const expected = join(destination, relative(root, link.resolved));
        let actual: string;
        try {
            actual = await realpath(path);
        } catch {
            throw new Error(
                `Cannot preserve the relative target layout of symlink: ${link.source}`,
            );
        }
        if (actual !== expected)
            throw new Error(`Symlink target changes after relocation: ${link.source}`);
    }
}
