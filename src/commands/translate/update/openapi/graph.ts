import {posix} from 'node:path';
import {parse} from 'yaml';

export type Address = (string | number)[];
export type ObjectValue = Record<string, unknown>;

type Site = {file: string; value: ObjectValue};
type Documents = Map<string, unknown>;

export function object(value: unknown): value is ObjectValue {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function conflict(reason: string, address: Address = []): never {
    const suffix = address.length ? ` at ${pointer(address)}` : '';
    throw new Error(`Cannot project changed OpenAPI contract: ${reason}${suffix}`);
}

export function pointer(address: Address): string {
    return address
        .map((key) => '/' + String(key).replace(/~/g, '~0').replace(/\//g, '~1'))
        .join('');
}

export function pointerTokens(fragment: string): string[] {
    if (!fragment) {
        return [];
    }
    if (!fragment.startsWith('/') || /~(?![01])/.test(fragment)) {
        conflict('invalid reference pointer');
    }
    return fragment
        .slice(1)
        .split('/')
        .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'));
}

export function valueAt(value: unknown, address: readonly (string | number)[]): unknown {
    for (const key of address) {
        if (
            (!object(value) && !Array.isArray(value)) ||
            !Object.prototype.hasOwnProperty.call(value, key)
        ) {
            return undefined;
        }
        value = (value as ObjectValue)[key];
    }
    return value;
}

/** Resolve local source refs while sharing expanded definitions between all uses. */
export function readContractGraph(
    root: string,
    graph: ReadonlyMap<string, string>,
    parsed: Map<string, unknown>,
) {
    const docs: Documents = new Map();
    const definitions = new Map<string, Site[]>();
    for (const [file, content] of graph) {
        if (!parsed.has(content)) {
            parsed.set(content, parse(content));
        }
        const value = parsed.get(content);
        docs.set(file, value);
        if (file === root || !object(value)) {
            continue;
        }
        for (const [key, child] of Object.entries(value)) {
            if (!object(child)) {
                continue;
            }
            const sites = definitions.get(key) ?? [];
            sites.push({file, value: child});
            definitions.set(key, sites);
        }
    }

    const cache = new Map<string, WeakMap<object, unknown>>();
    const resolving = new Map<string, WeakSet<object>>();
    function resolve(file: string, reference: string) {
        const [path, fragment = '', ...rest] = reference.split('#');
        if (rest.length || /^[\w+.-]+:/.test(path) || path.startsWith('/') || /[?\\]/.test(path)) {
            conflict(`unsupported local reference ${reference}`);
        }
        const target = path
            ? posix.normalize(posix.join(posix.dirname(file), decodeURIComponent(path)))
            : file;
        const value = valueAt(docs.get(target), pointerTokens(decodeURIComponent(fragment)));
        if (!object(value)) {
            conflict(`unresolved reference ${reference} in ${file}`);
        }
        return {target, value};
    }

    function expand(value: unknown, file: string): unknown {
        if (!object(value) && !Array.isArray(value)) {
            return value;
        }
        if (!cache.has(file)) {
            cache.set(file, new WeakMap());
        }
        if (!resolving.has(file)) {
            resolving.set(file, new WeakSet());
        }
        const memo = cache.get(file)!;
        const activeRefs = resolving.get(file)!;
        if (memo.has(value)) {
            return memo.get(value);
        }
        if (Array.isArray(value)) {
            const result: unknown[] = [];
            memo.set(value, result);
            value.forEach((child) => result.push(expand(child, file)));
            return result;
        }
        if (typeof value.$ref === 'string') {
            const {target, value: referenced} = resolve(file, value.$ref);
            if (activeRefs.has(value)) {
                conflict('recursive chain of reference objects');
            }
            activeRefs.add(value);
            const expanded = expand(referenced, target) as ObjectValue;
            activeRefs.delete(value);
            const siblings = Object.entries(value).filter(([key]) => key !== '$ref');
            const result = siblings.length
                ? {
                      ...Object.fromEntries(
                          siblings.map(([key, child]) => [key, expand(child, file)]),
                      ),
                      ...expanded,
                  }
                : expanded;
            memo.set(value, result);
            return result;
        }
        const result: ObjectValue = Object.create(null);
        memo.set(value, result);
        for (const [key, child] of Object.entries(value)) {
            result[key] = expand(child, file);
        }
        return result;
    }

    const api = expand(docs.get(root), root);
    if (
        !object(api) ||
        typeof api.openapi !== 'string' ||
        !/^3\.0(?:\.|$)/.test(api.openapi) ||
        !object(api.paths)
    ) {
        conflict('invalid OpenAPI root');
    }
    return {
        api,
        definitions,
        expandDefinition(site: Site) {
            return expand(site.value, site.file);
        },
    };
}

/** Compare expanded graphs without repeatedly walking shared subtrees. */
export function equality() {
    const results = new WeakMap<object, WeakMap<object, boolean>>();
    const active = new WeakMap<object, WeakSet<object>>();
    function same(left: unknown, right: unknown): boolean {
        if (Object.is(left, right)) {
            return true;
        }
        if (
            (!object(left) && !Array.isArray(left)) ||
            (!object(right) && !Array.isArray(right)) ||
            Array.isArray(left) !== Array.isArray(right)
        ) {
            return false;
        }
        if (!results.has(left)) {
            results.set(left, new WeakMap());
        }
        if (!active.has(left)) {
            active.set(left, new WeakSet());
        }
        const memo = results.get(left)!;
        const visiting = active.get(left)!;
        if (memo.has(right)) {
            return memo.get(right)!;
        }
        // A repeated pair on this traversal establishes a matching cycle. Any
        // changed sibling still causes the enclosing comparison to fail.
        if (visiting.has(right)) {
            return true;
        }
        visiting.add(right);
        const keys = Object.keys(left);
        const result =
            keys.length === Object.keys(right).length &&
            keys.every(
                (key) =>
                    Object.prototype.hasOwnProperty.call(right, key) &&
                    same((left as ObjectValue)[key], (right as ObjectValue)[key]),
            );
        visiting.delete(right);
        // Only cache mismatches. A match inside a recursive component may
        // depend on another pair higher up the stack.
        if (!result) {
            memo.set(right, result);
        }
        return result;
    }
    return same;
}
