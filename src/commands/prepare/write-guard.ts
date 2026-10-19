/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {syncBuiltinESMExports} from 'node:module';
import {basename, dirname, isAbsolute, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const authorized = new AsyncLocalStorage<boolean>();
const guardState = Symbol.for('diplodoc.prepare-write-guard');

/** Keep rejected mutations fatal even when an extension catches the filesystem error. */
export function assertPrepareWrites(): void {
    (globalThis as unknown as Record<symbol, (() => void) | undefined>)[guardState]?.();
}

/** Allow the prepare collector's own artifact and temporary-file operations. */
export function withPrepareWrites<T>(action: () => T): T {
    return authorized.run(true, action);
}

/** Reject observed extension writes outside discovery work, restoring every patched method on exit. */
export function installWriteGuard(work?: string): () => void {
    let active = true;
    let rejected: Error | undefined;
    const state = globalThis as unknown as Record<symbol, (() => void) | undefined>;
    const previous = state[guardState];
    state[guardState] = () => {
        if (rejected) throw rejected;
    };
    const realpath = fs.realpathSync.bind(fs);
    const originals: (() => void)[] = [];
    const descriptors = new Map<number, string>();
    const canonical = (path: string): string => {
        try {
            return realpath(path);
        } catch {
            const parent = dirname(path);
            return parent === path ? path : resolve(canonical(parent), basename(path));
        }
    };
    const assert = (value: unknown) => {
        if (!active || authorized.getStore() || (typeof value === 'number' && value <= 2)) return;
        let path: string | undefined;
        if (typeof value === 'number') path = descriptors.get(value);
        else if (value instanceof URL) path = fileURLToPath(value);
        else if (typeof value === 'string' || Buffer.isBuffer(value))
            path = resolve(value.toString());
        if (path && work) {
            const rel = relative(work, canonical(path));
            if (rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)))
                return;
        }
        const error = new Error(
            `Prepare discovery cannot modify original sources or files outside its temporary workspace: ${path || String(value)}`,
        );
        rejected ||= error;
        throw error;
    };
    const patch = (object: any, name: string, wrap: (original: any) => any) => {
        const original = object[name];
        if (!original) return;
        const replacement = wrap(original);
        object[name] = replacement;
        originals.push(() => {
            if (object[name] === replacement) object[name] = original;
        });
    };
    for (const name of [
        'writeFile',
        'appendFile',
        'write',
        'writev',
        'truncate',
        'ftruncate',
        'rm',
        'rmdir',
        'unlink',
        'mkdir',
        'mkdtemp',
        'chmod',
        'fchmod',
        'chown',
        'fchown',
        'utimes',
        'futimes',
        'lutimes',
    ]) {
        for (const [object, method] of [
            [fs, name],
            [fs, `${name}Sync`],
            [fs.promises, name],
        ] as const) {
            patch(
                object,
                method,
                (original) =>
                    function (this: unknown, ...args: any[]) {
                        assert(args[0]);
                        return original.apply(this, args);
                    },
            );
        }
    }
    for (const name of ['rename', 'copyFile', 'cp', 'link', 'symlink']) {
        for (const [object, method] of [
            [fs, name],
            [fs, `${name}Sync`],
            [fs.promises, name],
        ] as const) {
            patch(
                object,
                method,
                (original) =>
                    function (this: unknown, ...args: any[]) {
                        if (name === 'rename') assert(args[0]);
                        assert(args[1]);
                        return original.apply(this, args);
                    },
            );
        }
    }
    const writable = (flags: unknown) => {
        if (typeof flags !== 'number') return /[wa+]/.test(String(flags));
        const mask =
            fs.constants.O_WRONLY +
            fs.constants.O_RDWR +
            fs.constants.O_CREAT +
            fs.constants.O_TRUNC +
            fs.constants.O_APPEND;
        // Node's numeric open flags are a bitmask.
        // eslint-disable-next-line no-bitwise
        return Boolean(flags & mask);
    };
    const track = (descriptor: number, path: unknown) => {
        if (typeof path === 'string' || Buffer.isBuffer(path))
            descriptors.set(descriptor, resolve(path.toString()));
        else if (path instanceof URL) descriptors.set(descriptor, fileURLToPath(path));
    };
    patch(
        fs,
        'openSync',
        (original) =>
            function (...args: any[]) {
                if (writable(args[1])) assert(args[0]);
                const descriptor = original(...args);
                track(descriptor, args[0]);
                return descriptor;
            },
    );
    patch(
        fs,
        'open',
        (original) =>
            function (...args: any[]) {
                if (writable(args[1])) assert(args[0]);
                const callback = args[args.length - 1];
                args[args.length - 1] = (error: unknown, descriptor: number) => {
                    if (!error) track(descriptor, args[0]);
                    callback(error, descriptor);
                };
                return original(...args);
            },
    );
    patch(
        fs.promises,
        'open',
        (original) =>
            async function (...args: any[]) {
                if (writable(args[1])) assert(args[0]);
                const handle = await original(...args);
                track(handle.fd, args[0]);
                for (const name of [
                    'write',
                    'writev',
                    'writeFile',
                    'appendFile',
                    'truncate',
                    'chmod',
                    'chown',
                    'utimes',
                    'createWriteStream',
                ]) {
                    const method = handle[name];
                    if (method)
                        handle[name] = function (...params: any[]) {
                            assert(args[0]);
                            return method.apply(this, params);
                        };
                }
                return handle;
            },
    );
    patch(
        fs,
        'createWriteStream',
        (original) =>
            function (path: unknown, options: any) {
                assert(options?.fd ?? path);
                return original(path, options);
            },
    );
    syncBuiltinESMExports();
    return () => {
        active = false;
        state[guardState] = previous;
        for (const restore of originals.reverse()) restore();
        syncBuiltinESMExports();
    };
}
