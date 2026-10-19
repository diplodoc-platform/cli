/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {isAbsolute, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {minimatch} from 'minimatch';

export function inside(root: string, path: string) {
    const part = relative(root, path);
    return (
        Boolean(root) &&
        (part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`)))
    );
}

export function pathOf(value: unknown): string | undefined {
    if (value instanceof URL) return fileURLToPath(value);
    if (typeof value === 'string' || Buffer.isBuffer(value)) return resolve(value.toString());
    return undefined;
}

type Layer = {from: string; to: string; ignore: string[]; revision: number};

/** Read-through input and native merge copies; generated files stay in the work directory. */
export class InputOverlay {
    readonly unsupportedReads = new Set<string>();
    private directoryReads = new Map<string, {before: number; witness: string; source: string}>();
    private fileReads = new Map<string, Set<string>>();
    private layers: Layer[] = [];
    private shadows = new Map<string, number>();
    private revision = 0;
    private stage = '';
    private input = '';
    private original = new AsyncLocalStorage<boolean>();
    private physical = new AsyncLocalStorage<boolean>();
    private native = {
        lstat: fs.lstatSync.bind(fs),
        stat: fs.statSync.bind(fs),
        realpath: fs.realpathSync.bind(fs),
        readlink: fs.readlinkSync.bind(fs),
        readdir: fs.readdirSync.bind(fs),
    };

    observeReadlink: (path: string) => void = () => {};

    configure(input: string, stage: string) {
        this.stage = stage;
        this.input = input;
        this.layers.push({from: input, to: stage, ignore: [], revision: ++this.revision});
    }

    physicalFiles<T>(action: () => Promise<T>) {
        return this.physical.run(true, action);
    }

    originalPresets<T>(action: () => Promise<T>) {
        return this.original.run(true, action);
    }

    inputCopy(ignore: string[]) {
        this.layers[0].ignore = ignore;
    }

    copy(from: string, to: string, ignore: string[]) {
        this.layers.push({from, to, ignore, revision: ++this.revision});
    }

    written(value: unknown) {
        const path = pathOf(value);
        if (path && inside(this.stage, path)) this.shadows.set(path, ++this.revision);
    }

    source(path: string, before = Infinity, preferWrites = true): string {
        if (this.physical.getStore() || !inside(this.stage, path)) return path;
        if (this.original.getStore()) return join(this.input, relative(this.stage, path));
        const shadow = this.shadows.get(path) || 0;
        for (const layer of [...this.layers].reverse()) {
            if (layer.revision >= before || !inside(layer.to, path)) continue;
            if (preferWrites && shadow > layer.revision && shadow < before) return path;
            const part = relative(layer.to, path);
            if (this.ignored(layer, part)) continue;
            const source = this.source(join(layer.from, part), layer.revision, preferWrites);
            try {
                this.native.lstat(source);
                return source;
            } catch (error) {
                if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || ''))
                    throw error;
            }
        }
        if (shadow >= before)
            return join(
                this.stage,
                '.prepare-unavailable',
                String(before),
                relative(this.stage, path),
            );
        return path;
    }

    /** Native merge metadata survives later generated writes to the copied target. */
    metadataSource(path: string) {
        return this.source(path, Infinity, false);
    }

    /** Virtual paths must stay inside Run.input for native project-scope checks. */
    virtual(path: string) {
        return !this.physical.getStore() && inside(this.stage, path);
    }

    recordFile(path: string, source: string) {
        let staged = path;
        if (!inside(this.stage, staged)) {
            if (!inside(this.input, source)) return;
            staged = join(this.stage, relative(this.input, source));
        }
        const sources = this.fileReads.get(staged) || new Set<string>();
        sources.add(source);
        this.fileReads.set(staged, sources);
    }

    recordDirectory(path: string) {
        const entry = this.inspect(path);
        if (entry.witness && !this.directoryReads.has(path))
            this.directoryReads.set(path, {
                before: this.revision + 1,
                witness: entry.witness,
                source: entry.source,
            });
        return entry.source;
    }

    /** Add a file witness only when selected files do not already recreate an observed directory. */
    completeDirectories(read: (path: string) => void) {
        for (const [directory, observation] of [...this.directoryReads].sort(
            ([left], [right]) => right.length - left.length,
        )) {
            let covered = false;
            for (const [path, sources] of this.fileReads) {
                if (this.coversSourceDirectory(directory, observation, sources)) {
                    covered = true;
                    break;
                }
                const copies = new Set([path]);
                for (const layer of this.layers) {
                    if (layer.revision >= observation.before) continue;
                    for (const copy of [...copies]) {
                        const part = relative(layer.from, copy);
                        if (inside(layer.from, copy) && !this.ignored(layer, part))
                            copies.add(join(layer.to, part));
                    }
                }
                for (const copy of copies) {
                    if (copy === directory || !inside(directory, copy)) continue;
                    try {
                        const actual = this.source(copy, observation.before);
                        if (
                            this.native.stat(actual).isFile() &&
                            [...sources].some(
                                (source) =>
                                    this.native.realpath(actual) === this.native.realpath(source),
                            )
                        )
                            covered = true;
                    } catch {
                        /* An unavailable copy cannot recreate the directory. */
                    }
                    if (covered) break;
                }
                if (covered) break;
            }
            if (!covered) read(observation.witness);
        }
    }

    inspect(path: string) {
        const source = this.source(path);
        const info = source === path ? this.native.lstat(source) : this.native.stat(source);
        if (info.isDirectory()) {
            try {
                const physical = this.native.lstat(path);
                if (physical.isDirectory())
                    return {source: path, info: physical, copied: false, witness: undefined};
            } catch {
                /* Source-backed directories are materialized only by copied files. */
            }
            const witness = this.findWitness(path, Infinity, new Set());
            if (!witness) throw this.missing(path);
            return {source, info, copied: source !== path, witness: this.source(witness)};
        }
        return {source, info, copied: source !== path, witness: undefined};
    }

    entries(path: string, options: any = {}) {
        if (options?.recursive)
            this.rejectUnsupportedRead(
                'Recursive directory reads of the prepare staging overlay are unsupported; use scoped glob',
            );
        this.inspect(path);
        const encoding = typeof options === 'string' ? options : options?.encoding;
        const values = [];
        for (const [name, template] of [...this.candidates(path, Infinity)].sort(
            ([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)),
        )) {
            const child = join(path, name);
            let entry;
            try {
                entry = this.inspect(child);
            } catch (error) {
                if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || ''))
                    continue;
                throw error;
            }
            const info = entry.info;
            const value = Object.assign(
                Object.create(template ? Object.getPrototypeOf(template) : fs.Dirent.prototype),
                template,
                {name: encoding === 'buffer' ? Buffer.from(name) : name, parentPath: path, path},
            );
            for (const method of [
                'isFile',
                'isDirectory',
                'isSymbolicLink',
                'isBlockDevice',
                'isCharacterDevice',
                'isFIFO',
                'isSocket',
            ] as const)
                value[method] = () => info[method]();
            values.push(value);
        }
        if (options?.withFileTypes) return values;
        return values.map((entry) =>
            encoding === 'buffer' ? Buffer.from(entry.name) : entry.name,
        );
    }

    /** Map only read endpoints; all writes continue to target physical work files. */
    install() {
        const overlay = this;
        const patch = (object: any, name: string, sync = false) => {
            const original = object[name];
            if (!original) return;
            const wrap = (original: any) =>
                function (this: unknown, ...args: any[]) {
                    const path = pathOf(args[0]);
                    if (!path || !overlay.virtual(path)) return original.apply(this, args);
                    const callback =
                        !sync && typeof args[args.length - 1] === 'function'
                            ? args.pop()
                            : undefined;
                    const operation = () => {
                        if (name.startsWith('opendir')) {
                            overlay.rejectUnsupportedRead(
                                'Directory iteration with opendir of the prepare staging overlay is unsupported; use readdir or scoped glob',
                            );
                        }
                        if (name.startsWith('readdir')) return overlay.entries(path, args[1]);
                        if (name.startsWith('open') && overlay.writingOpen(args[1]))
                            return original.apply(this, args);
                        let entry;
                        try {
                            entry = overlay.inspect(path);
                        } catch (error) {
                            if (name === 'existsSync') return false;
                            if (
                                ['statSync', 'lstatSync'].includes(name) &&
                                args[1]?.throwIfNoEntry === false &&
                                (error as NodeJS.ErrnoException).code === 'ENOENT'
                            )
                                return undefined;
                            throw error;
                        }
                        if (name.startsWith('realpath')) {
                            const actual = entry.copied ? path : overlay.native.realpath(path);
                            return args[1] === 'buffer' || args[1]?.encoding === 'buffer'
                                ? Buffer.from(actual)
                                : actual;
                        }
                        if (name.startsWith('readlink')) {
                            if (entry.copied) {
                                overlay.observeReadlink(path);
                                throw Object.assign(
                                    new Error(`EINVAL: invalid argument, readlink '${path}'`),
                                    {code: 'EINVAL', errno: -22, syscall: 'readlink', path},
                                );
                            }
                            return overlay.native.readlink(path, args[1]);
                        }
                        if (name.startsWith('lstat') || name.startsWith('stat')) {
                            return entry.copied || name.startsWith('stat')
                                ? overlay.native.stat(entry.source, args[1])
                                : overlay.native.lstat(entry.source, args[1]);
                        }
                        args[0] = overlay.source(path);
                        return original.apply(this, args);
                    };
                    if (callback) {
                        if (
                            [
                                'readdir',
                                'realpath',
                                'opendir',
                                'stat',
                                'lstat',
                                'readlink',
                            ].includes(name)
                        ) {
                            try {
                                const result = operation();
                                queueMicrotask(() => callback(null, result));
                            } catch (error) {
                                queueMicrotask(() => callback(error));
                            }
                            return;
                        }
                        args.push(callback);
                        try {
                            return operation();
                        } catch (error) {
                            queueMicrotask(() => callback(error));
                            return;
                        }
                    }
                    if (object === fs.promises) return Promise.resolve().then(operation);
                    return operation();
                };
            const replacement: any = wrap(original);
            if (typeof original.native === 'function') replacement.native = wrap(original.native);
            object[name] = replacement;
        };
        for (const name of [
            'readFile',
            'readlink',
            'stat',
            'lstat',
            'access',
            'realpath',
            'readdir',
            'opendir',
            'open',
        ]) {
            patch(fs, name);
            patch(fs, `${name}Sync`, true);
            patch(fs.promises, name);
        }
        for (const name of ['existsSync', 'createReadStream']) patch(fs, name, true);
        for (const object of [fs, fs.promises] as any[]) {
            for (const name of ['copyFile', 'copyFileSync', 'link', 'linkSync']) {
                const original = object[name];
                if (original)
                    object[name] = function (...args: any[]) {
                        const path = pathOf(args[0]);
                        if (path) args[0] = overlay.source(path);
                        return original.apply(this, args);
                    };
            }
        }
    }
    rejectUnsupportedRead(message: string): never {
        this.unsupportedReads.add(message);
        throw new Error(message);
    }
    private ignored(layer: Layer, part: string) {
        return layer.ignore.some(
            (pattern) =>
                minimatch(part, pattern, {dot: true}) ||
                (pattern.endsWith('/**') && minimatch(part, pattern.slice(0, -3), {dot: true})),
        );
    }

    private coversSourceDirectory(
        directory: string,
        observation: {before: number; source: string},
        sources: Set<string>,
    ) {
        const canonicalDirectory = this.native.realpath(observation.source);
        for (const source of sources) {
            try {
                if (!this.native.stat(source).isFile()) continue;
                const canonical = this.native.realpath(source);
                if (!inside(canonicalDirectory, canonical)) continue;
                const candidate = join(directory, relative(canonicalDirectory, canonical));
                const actual = this.source(candidate, observation.before);
                if (
                    inside(observation.source, actual) &&
                    this.native.realpath(actual) === canonical
                )
                    return true;
            } catch {
                /* Only an eligible file through this observed source view covers the directory. */
            }
        }
        return false;
    }

    private writingOpen(flags: unknown) {
        if (typeof flags !== 'number') return /[wa+]/.test(String(flags || 'r'));
        const writes =
            fs.constants.O_WRONLY +
            fs.constants.O_RDWR +
            fs.constants.O_CREAT +
            fs.constants.O_TRUNC +
            fs.constants.O_APPEND;
        // Node's numeric open flags are a bitmask.
        // eslint-disable-next-line no-bitwise
        return Boolean(flags & writes);
    }

    private candidates(path: string, before: number) {
        const names = new Map<string, any>();
        const bases = new Set([path]);
        for (const layer of this.layers) {
            if (layer.revision >= before) continue;
            if (inside(layer.to, path))
                bases.add(this.source(join(layer.from, relative(layer.to, path)), layer.revision));
            else if (inside(path, layer.to))
                names.set(relative(path, layer.to).split(sep)[0], undefined);
        }
        for (const base of bases) {
            try {
                for (const entry of this.native.readdir(base, {withFileTypes: true}))
                    names.set(entry.name, entry);
            } catch (error) {
                if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || ''))
                    throw error;
            }
        }
        return names;
    }

    private findWitness(path: string, before: number, parents: Set<string>): string | undefined {
        const source = this.source(path, before);
        let canonical;
        try {
            canonical = this.native.realpath(source);
        } catch {
            return undefined;
        }
        if (parents.has(canonical)) return undefined;
        const ancestors = new Set(parents).add(canonical);
        const directories = [];
        for (const name of this.candidates(path, before).keys()) {
            const child = join(path, name);
            try {
                const info = this.native.stat(this.source(child, before));
                if (info.isFile()) return child;
                if (info.isDirectory()) directories.push(child);
            } catch (error) {
                if (
                    !['ENOENT', 'ENOTDIR', 'ELOOP'].includes(
                        (error as NodeJS.ErrnoException).code || '',
                    )
                )
                    throw error;
            }
        }
        for (const directory of directories) {
            const witness = this.findWitness(directory, before, ancestors);
            if (witness) return witness;
        }
        return undefined;
    }

    private missing(path: string) {
        return Object.assign(new Error(`ENOENT: no such file or directory, stat '${path}'`), {
            code: 'ENOENT',
            errno: -2,
            syscall: 'stat',
            path,
        });
    }
}
