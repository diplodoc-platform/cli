/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {syncBuiltinESMExports} from 'node:module';
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

import {installWriteGuard} from './write-guard';
import {InputOverlay} from './overlay';

const destination = process.env.YFM_PREPARE_TRACE;
if (destination) {
    installWriteGuard(process.env.YFM_PREPARE_WORK);
    const native = {
        statSync: fs.statSync.bind(fs),
        lstatSync: fs.lstatSync.bind(fs),
        realpathSync: fs.realpathSync.bind(fs),
        writeFileSync: fs.writeFileSync.bind(fs),
    };
    const overlay = new InputOverlay();
    overlay.install();
    const provenance = new Map<string, string | null>();
    const ignoreProbes = new AsyncLocalStorage<boolean>();
    const consumed = new Set<string>();
    const external = new Set<string>();
    const pending = new Set<string>();
    const directories = new Set<string>();
    const pendingDirectories = new Set<string>();
    const descriptors = new Map<number, string>();
    const installation = resolve(__dirname, '..');
    const runtime = ['build', 'lib', 'assets'].map((part) => resolve(installation, part));
    let configPath: string | undefined;
    let input = '';
    let staged = '';
    let output = '';

    const pathOf = (value: unknown): string | undefined => {
        if (typeof value === 'number') return descriptors.get(value);
        if (value instanceof URL) {
            return fileURLToPath(value);
        }
        if (typeof value === 'string' || Buffer.isBuffer(value)) {
            return resolve(value.toString());
        }
        return undefined;
    };
    const inside = (root: string, path: string) => {
        const rel = relative(root, path);
        return (
            root &&
            (rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)))
        );
    };
    const origin = (path: string): string | undefined => {
        if (provenance.has(path)) {
            return provenance.get(path) || undefined;
        }
        const source = overlay.source(path);
        if (inside(input, source)) return source;
        if (source !== path && !inside(staged, source)) return source;
        return undefined;
    };
    const read = (value: unknown) => {
        let path = pathOf(value);
        if (!path) return;
        if (!input) {
            pending.add(path);
            return;
        }
        if (!inside(input, path) && !inside(staged, path) && !inside(output, path)) {
            try {
                path = join(native.realpathSync(dirname(path)), basename(path));
            } catch {
                /* Preserve unresolved paths for diagnostics. */
            }
        }
        const source = origin(path);
        if (source) {
            consumed.add(source);
            overlay.recordFile(path, source);
        } else if (
            !inside(staged, path) &&
            !inside(output, path) &&
            !runtime.some((root) => inside(root, path)) &&
            path !== resolve(installation, 'package.json') &&
            !path.split(sep).includes('node_modules')
        ) {
            external.add(path);
        }
    };
    const directory = (value: unknown) => {
        if (ignoreProbes.getStore()) return;
        let path = pathOf(value);
        if (!path) return;
        if (!input) {
            pendingDirectories.add(path);
            return;
        }
        if (inside(staged, path)) {
            path = overlay.recordDirectory(path);
            try {
                if (!native.statSync(path).isDirectory()) return;
            } catch {
                return;
            }
        }
        if (!inside(input, path)) {
            try {
                path = native.realpathSync(path);
            } catch {
                return;
            }
        }
        if (
            inside(input, path) ||
            (!inside(output, path) &&
                !runtime.some((root) => inside(root, path)) &&
                !path.split(sep).includes('node_modules'))
        )
            directories.add(path);
    };
    const probe = (value: unknown) => {
        if (ignoreProbes.getStore()) return;
        const path = pathOf(value);
        if (path) {
            try {
                const info = native.lstatSync(overlay.source(path));
                if (info.isFile() || info.isSymbolicLink()) read(path);
                if (
                    info.isDirectory() ||
                    (overlay.virtual(path) && overlay.inspect(path).info.isDirectory())
                )
                    directory(path);
            } catch {
                /* A failed existence check is not an input file. */
            }
        }
    };
    overlay.observeReadlink = probe;
    const listed = (value: unknown, entries: any[]) => {
        if (ignoreProbes.getStore()) return;
        const base = pathOf(value);
        if (!base) return;
        directory(base);
        for (const entry of entries) {
            const path =
                typeof entry === 'string' || Buffer.isBuffer(entry)
                    ? resolve(base, entry.toString())
                    : resolve(String(entry.parentPath || entry.path || base), String(entry.name));
            probe(path);
        }
    };
    const openedDirectory = (handle: any) => {
        directory(handle.path);
        const observe = (entry: any) => {
            if (entry) listed(handle.path, [entry]);
        };
        for (const name of ['read', 'readSync']) {
            const original = handle[name];
            handle[name] = function (...args: any[]) {
                const callback = args[args.length - 1];
                if (typeof callback === 'function') {
                    args[args.length - 1] = (error: unknown, entry: unknown) => {
                        if (!error) observe(entry);
                        callback(error, entry);
                    };
                    return original.apply(this, args);
                }
                const result = original.apply(this, args);
                if (result?.then)
                    return result.then((entry: unknown) => {
                        observe(entry);
                        return entry;
                    });
                observe(result);
                return result;
            };
        }
        const iterator = handle[Symbol.asyncIterator];
        handle[Symbol.asyncIterator] = async function* () {
            for await (const entry of iterator.call(this)) {
                observe(entry);
                yield entry;
            }
        };
    };
    const copied = (source: unknown, target: unknown, from: string | undefined) => {
        const path = pathOf(target);
        if (!path) return;
        if (inside(staged, path)) {
            provenance.set(path, from || null);
            overlay.written(path);
        } else {
            read(source);
        }
    };
    const written = (value: unknown) => {
        const path = pathOf(value);
        if (path && inside(staged, path)) {
            provenance.set(path, null);
            overlay.written(path);
        }
    };
    const instrument = (
        object: any,
        name: string,
        kind: 'read' | 'copy' | 'write' | 'rename' | 'symlink' | 'probe' | 'list' | 'directory',
        sync = false,
    ) => {
        const original = object[name];
        if (!original) return;
        const replacement = function (this: unknown, ...args: any[]) {
            const source = pathOf(args[0]);
            const from = source && origin(source);
            const success = (value?: any) => {
                if (kind === 'read') read(args[0]);
                else if (kind === 'probe') probe(args[0]);
                else if (kind === 'list') listed(args[0], value);
                else if (kind === 'directory') openedDirectory(value);
                else if (kind === 'copy') copied(args[0], args[1], from);
                else if (kind === 'symlink') written(args[1]);
                else if (kind === 'rename') {
                    const target = pathOf(args[1]);
                    if (target && inside(staged, target)) {
                        provenance.set(target, from || null);
                        overlay.written(target);
                    }
                    written(args[0]);
                } else written(args[0]);
            };
            const probeScope = ignoreProbes.getStore();
            const invoke = () => {
                const call = () => original.apply(this, args);
                // realpath may traverse ancestors through Node filesystem APIs internally.
                return name === 'realpath' || name === 'realpathSync' || name === 'native'
                    ? ignoreProbes.run(true, call)
                    : call();
            };
            const callback = args[args.length - 1];
            if (!sync && typeof callback === 'function') {
                args[args.length - 1] = function (
                    this: unknown,
                    error: unknown,
                    ...values: unknown[]
                ) {
                    return ignoreProbes.run(probeScope || false, () => {
                        if (!error) success(values[0]);
                        return callback.call(this, error, ...values);
                    });
                };
                return invoke();
            }
            const result = invoke();
            if (!sync && result?.then) {
                return result.then((value: unknown) => {
                    success(value);
                    return value;
                });
            }
            success(result);
            return result;
        };
        object[name] = replacement;
        if (typeof original.native === 'function') {
            replacement.native = original.native;
            instrument(replacement, 'native', kind, sync);
        }
    };
    for (const [name, kind] of [
        ['readFile', 'read'],
        ['readlink', 'read'],
        ['read', 'read'],
        ['readv', 'read'],
        ['stat', 'probe'],
        ['lstat', 'probe'],
        ['access', 'probe'],
        ['realpath', 'probe'],
        ['readdir', 'list'],
        ['opendir', 'directory'],
        ['copyFile', 'copy'],
        ['link', 'copy'],
        ['symlink', 'symlink'],
        ['mkdir', 'write'],
        ['writeFile', 'write'],
        ['appendFile', 'write'],
        ['unlink', 'write'],
        ['rename', 'rename'],
    ] as const) {
        instrument(fs, name, kind);
        instrument(fs, `${name}Sync`, kind, true);
        instrument(fs.promises, name, kind);
    }
    const readOnly = (flags: unknown) => {
        if (typeof flags !== 'number') return !/[wa+]/.test(String(flags || 'r'));
        const writes =
            fs.constants.O_WRONLY +
            fs.constants.O_RDWR +
            fs.constants.O_CREAT +
            fs.constants.O_TRUNC +
            fs.constants.O_APPEND;
        // Node's numeric open flags are a bitmask.
        // eslint-disable-next-line no-bitwise
        return (flags & writes) === 0;
    };
    const openSync = fs.openSync;
    fs.openSync = ((path: fs.PathLike, flags: any, mode?: any) => {
        const descriptor = openSync(path, flags, mode);
        const resolved = pathOf(path);
        if (resolved) descriptors.set(descriptor, resolved);
        if (readOnly(flags)) probe(path);
        return descriptor;
    }) as typeof fs.openSync;
    const openCallback = fs.open;
    fs.open = ((...args: any[]) => {
        const callback = args[args.length - 1];
        const path = pathOf(args[0]);
        args[args.length - 1] = (error: unknown, descriptor: number) => {
            if (!error && path) {
                descriptors.set(descriptor, path);
                if (readOnly(args[1])) probe(path);
            }
            callback(error, descriptor);
        };
        return (openCallback as any)(...args);
    }) as typeof fs.open;
    const existsSync = fs.existsSync;
    fs.existsSync = ((path: fs.PathLike) => {
        const result = existsSync(path);
        if (result) probe(path);
        return result;
    }) as typeof fs.existsSync;
    const stream = fs.createReadStream;
    fs.createReadStream = ((path: fs.PathLike, options: any) => {
        const result = stream(path, options);
        result.once('open', () => read(path));
        return result;
    }) as typeof fs.createReadStream;
    const open = fs.promises.open;
    fs.promises.open = (async (...args: Parameters<typeof open>) => {
        const handle = await open(...args);
        if (readOnly(args[1])) probe(args[0]);
        for (const name of ['readFile', 'read', 'readv', 'createReadStream']) {
            const original = (handle as any)[name];
            if (original)
                (handle as any)[name] = function (...params: unknown[]) {
                    read(args[0]);
                    return original.apply(this, params);
                };
        }
        return handle;
    }) as typeof open;
    (globalThis as any)[Symbol.for('diplodoc.input-trace')] = {
        configure(original: string, stage: string, target: string, config: string) {
            input = original;
            staged = stage;
            output = target;
            overlay.configure(original, stage);
            try {
                configPath = native.realpathSync(config);
            } catch {
                /* The default config may be absent. */
            }
            for (const path of pending) {
                read(path);
            }
            for (const path of pendingDirectories) directory(path);
        },
        probe,
        overlay,
        read,
        withoutProbes<T>(action: () => Promise<T>) {
            return ignoreProbes.run(true, action);
        },
    };
    syncBuiltinESMExports();
    process.on('exit', () => {
        overlay.completeDirectories(read);
        native.writeFileSync(
            destination,
            JSON.stringify({
                files: [...consumed].sort(),
                external: [...external].sort(),
                directories: [...directories].sort(),
                config: configPath,
                unsupportedReads: [...overlay.unsupportedReads],
            }),
        );
    });
}
