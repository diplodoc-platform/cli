import {copyFile, mkdir, readdir, realpath, stat} from 'node:fs/promises';
import {lstatSync, statSync} from 'node:fs';
import {dirname, isAbsolute, join, relative, sep} from 'node:path';
import {glob} from 'glob';
import {minimatch} from 'minimatch';

type GlobOptions = {
    cwd?: AbsolutePath;
    ignore?: string[];
};

/** Source provenance for an optional, initially empty build workspace. */
export class SourceService {
    private input?: string;

    private stage?: string;

    private ignore: string[] = [];

    private selected = new Set<string>();

    private copies = new Map<string, string>();

    private deleted = new Set<string>();

    get active() {
        return this.input !== undefined;
    }

    get dependencies(): readonly string[] {
        return [...this.selected];
    }

    isWorkspacePath(path: string) {
        return Boolean(this.stage && inside(this.stage, path));
    }

    /** Enable selective source access without changing the process filesystem. */
    configure(input: AbsolutePath, stage: AbsolutePath, ignore: string[] = []) {
        this.input = input;
        this.stage = stage;
        this.ignore = ignore;
    }

    /** Resolve a logical input path, preferring generated or copied workspace files. */
    resolve(path: string, select = true): AbsolutePath {
        let source = path;
        if (this.stage && this.input && inside(this.stage, path)) {
            try {
                lstatSync(path);
            } catch (error) {
                if (
                    (error as NodeJS.ErrnoException).code === 'ENOENT' &&
                    !this.workspaceLink(path)
                ) {
                    const part = relative(this.stage, path);
                    if (
                        !this.ignored(part) &&
                        ![...this.deleted].some((root) => inside(root, path))
                    ) {
                        source = join(this.input, part);
                    }
                }
            }
        }
        if (select && this.active) {
            const original = this.copies.get(path) || source;
            if (!this.stage || !inside(this.stage, original)) {
                if (this.copies.has(path) || (this.input && inside(this.input, original))) {
                    this.select(original);
                }
            }
        }
        return source as AbsolutePath;
    }

    /** Access original presets before any merge or generated file changes the workspace. */
    original(path: string): string {
        if (this.input && this.stage && inside(this.stage, path)) {
            return join(this.input, relative(this.stage, path));
        }
        return path;
    }

    /** Explicitly declare a file or directory tree used by an extension. */
    async depend(path: AbsolutePath, ancestors = new Set<string>()): Promise<void> {
        if (!this.active) {
            return;
        }
        const source = this.copies.get(path) || this.resolve(path, false);
        const info = await stat(source);
        if (!this.isWorkspacePath(source)) {
            this.selected.add(source);
        }
        if (info.isDirectory()) {
            if (this.isWorkspacePath(path)) {
                for (const file of await this.glob('**', {cwd: path}, false)) {
                    await this.depend(join(path, file) as AbsolutePath);
                }
                return;
            }
            const canonical = await realpath(source as AbsolutePath);
            if (ancestors.has(canonical)) {
                return;
            }
            const parents = new Set(ancestors).add(canonical);
            for (const entry of await readdir(source)) {
                if (this.input && inside(this.input, source)) {
                    if (this.ignored(relative(this.input, join(source, entry)))) {
                        continue;
                    }
                }
                await this.depend(join(source, entry) as AbsolutePath, parents);
            }
        }
    }

    /** Provide a physical file for native adapters that cannot consume Run IO. */
    async materialize(path: AbsolutePath, select = true): Promise<AbsolutePath> {
        const source = this.resolve(path, select);
        if (source === path) {
            return path;
        }
        await mkdir(dirname(path), {recursive: true});
        await copyFile(source, path);
        this.copied(source, path);
        return path;
    }

    /** Remember original provenance without selecting unused merge-copy contents. */
    copied(from: string, to: string) {
        if (!this.stage || !inside(this.stage, to)) {
            return;
        }
        const original = this.copies.get(from) || this.resolve(from, false);
        if (inside(this.stage, original)) {
            this.copies.delete(to);
        } else {
            this.copies.set(to, original);
        }
    }

    /** Generated content replaces copied bytes; previously selected originals remain selected. */
    written(path: string) {
        this.copies.delete(path);
    }

    /** Original bytes associated with a physical copy, before generated content replaces them. */
    copiedSource(path: string): AbsolutePath | undefined {
        return this.copies.get(path) as AbsolutePath | undefined;
    }

    removed(path: string) {
        if (this.isWorkspacePath(path)) {
            this.deleted.add(path);
        }
        for (const copy of this.copies.keys()) {
            if (inside(path, copy)) {
                this.copies.delete(copy);
            }
        }
    }

    /** Initial physical cleanup starts a fresh workspace without deleting logical sources. */
    resetWorkspace() {
        this.copies.clear();
        this.deleted.clear();
    }

    /** Enumerate native source and generated files without recursively staging the source tree. */
    async glob(pattern: string | string[], options: GlobOptions, select = true) {
        const settings = {dot: true, nodir: true, follow: true, ...options};
        const cwd = options.cwd;
        if (!this.stage || !this.input || !cwd || !inside(this.stage, cwd)) {
            const paths = await glob(pattern, settings);
            if (select && this.active && cwd) {
                for (const path of paths) {
                    this.resolve(join(cwd, path));
                }
            }
            return paths;
        }

        if (
            pattern === '**/toc.yaml' &&
            cwd === this.stage &&
            options.ignore?.some(
                (pattern) => pattern === '**/*/toc.yaml' || pattern === '*/**/toc.yaml',
            )
        ) {
            if (options.ignore.some((pattern) => minimatch('toc.yaml', pattern, {dot: true}))) {
                return [];
            }
            const path = this.resolve(join(cwd, 'toc.yaml'), select);
            try {
                return statSync(path).isFile() ? ['toc.yaml'] : [];
            } catch {
                return [];
            }
        }

        const originalCwd = join(this.input, relative(this.stage, cwd));
        const originals = await glob(pattern, {...settings, cwd: originalCwd});
        const generated = await glob(pattern, settings);
        const paths = [...new Set([...originals, ...generated])].filter((path) => {
            const target = join(cwd, path);
            const source = this.resolve(target, false);
            if (source !== target && this.ignored(relative(this.stage as string, target))) {
                return false;
            }
            try {
                return statSync(source).isFile();
            } catch {
                return false;
            }
        });
        if (select) {
            for (const path of paths) {
                this.resolve(join(cwd, path));
            }
        }
        return paths;
    }

    private select(path: string) {
        try {
            if (statSync(path).isFile()) {
                this.selected.add(path);
            }
        } catch {
            // Missing files are native build diagnostics, not portable source dependencies.
        }
    }

    private workspaceLink(path: string) {
        for (let parent = dirname(path); this.isWorkspacePath(parent); parent = dirname(parent)) {
            try {
                if (lstatSync(parent).isSymbolicLink()) {
                    return true;
                }
            } catch {
                // Missing workspace directories can still have original source descendants.
            }
        }
        return false;
    }

    private ignored(path: string) {
        return this.ignore.some((pattern) => minimatch(path, pattern, {dot: true}));
    }
}

function inside(root: string, path: string) {
    const part = relative(root, path);
    return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`));
}
