import {isDeepStrictEqual} from 'node:util';
import {compose} from '@diplodoc/translation';
import {parse, stringify} from 'yaml';

import {untranslatedMarker} from '../../providers/ai/utils/script';
import {extractYfm, yfmProse} from '../text/yfm-units';

import {markup, textPlanner} from './annotations';
import {equality, readContractGraph} from './graph';
import {isTextPointer} from './text-fields';

type Value = string | number | boolean | null | Value[] | {[key: string]: Value};
type Obj = {[key: string]: Value};
function object(value: Value): Obj {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Expected an OpenAPI mapping');
    }
    return value;
}
const escape = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');
/** Extract a note title while preserving the exact opening marker. */
function noteTitle(line: string) {
    const open = line.trimStart();
    if (!open.startsWith('{% note ')) {
        return undefined;
    }
    const close = '\n\n{% endnote %}';
    const block = open + close;
    const frame = extractYfm(block);
    if (
        frame.units.length !== 1 ||
        !frame.skeleton.endsWith(close) ||
        compose(frame.skeleton, frame.units, {useSource: true}) !== block
    ) {
        return undefined;
    }
    const marker = '%%%0%%%';
    const header = frame.skeleton.slice(0, -close.length);
    const slot = header.indexOf(marker);
    if (slot < 0 || header.lastIndexOf(marker) !== slot) {
        return undefined;
    }
    const title = compose(marker, frame.units, {useSource: true});
    const prefix = line.slice(0, line.length - open.length) + header.slice(0, slot);
    const suffix = header.slice(slot + marker.length);
    if (prefix + title + suffix !== line) {
        return undefined;
    }
    return {title, prefix, suffix};
}
function routeBlock(yaml: string, path: string) {
    if (!/^\/[\w/.{}~-]+$/.test(path)) {
        throw new Error('Unsupported YAML route key');
    }
    const header = '  ' + path + ':\n';
    const start = yaml.indexOf('\n' + header) + 1;
    if (!start || yaml.includes('\n' + header, start)) {
        throw new Error('Expected a unique path in the bundled target');
    }
    const body = start + header.length;
    const next = /^(?: {2}\S|[^\s#])/m.exec(yaml.slice(body));
    const end = next ? body + next.index : yaml.length;
    return {start, end, text: yaml.slice(start, end)};
}

// The complete note must still occur in the same operation after a surrounding prose edit.
function sameChangedNote(afterText: string, currentText: string, addedLine: string): boolean {
    const line = addedLine.trim();
    if (!noteTitle(line)) {
        return false;
    }
    function block(description: string): string | undefined {
        const lines = description.split('\n');
        const start = lines.indexOf(line);
        if (start < 0 || lines.lastIndexOf(line) !== start) {
            return;
        }
        const end = lines.indexOf('{% endnote %}', start + 1);
        if (end < 0 || lines.slice(start + 1, end).some((l) => l.includes('{% note '))) {
            return;
        }
        return lines.slice(start, end + 1).join('\n');
    }
    const after = parse(afterText) as Value,
        current = parse(currentText) as Value;
    let matched = 0;
    function align(a: Value, b: Value | undefined): void {
        if (!a || typeof a !== 'object' || !b || typeof b !== 'object') {
            return;
        }
        if (
            !Array.isArray(a) &&
            !Array.isArray(b) &&
            typeof a.operationId === 'string' &&
            a.operationId === b.operationId &&
            typeof a.description === 'string' &&
            typeof b.description === 'string'
        ) {
            const expected = block(a.description);
            if (expected && block(b.description) === expected) {
                b.description = a.description;
                matched++;
            }
        }
        for (const [key, value] of Object.entries(a)) {
            align(value, (b as Obj)[key]);
        }
    }
    align(after, current);
    return matched === 1 && isDeepStrictEqual(after, current);
}

/** Identify a single title edit surrounded by otherwise identical source lines. */
export function changedNoteTitle(before: string, after: string): string | undefined {
    const previous = before.split(/\r?\n/);
    const next = after.split(/\r?\n/);
    if (previous.length !== next.length) {
        return;
    }
    const changed = previous.flatMap((line, index) => (line === next[index] ? [] : [index]));
    if (changed.length !== 1) {
        return;
    }
    const [index] = changed;
    const oldTitle = noteTitle(previous[index]);
    const newTitle = noteTitle(next[index]);
    if (
        !oldTitle ||
        !newTitle ||
        oldTitle.prefix !== newTitle.prefix ||
        oldTitle.suffix !== newTitle.suffix
    ) {
        return;
    }
    return next[index];
}

/** Insert a route together with its change to an existing operation's note title. */
export function planAddedRoute(
    root: string,
    previous: ReadonlyMap<string, string>,
    graph: ReadonlyMap<string, string>,
    live: ReadonlyMap<string, string>,
    changedNote: {file: string; header: string},
    current: string,
    ...[sourceLang, targetLang]: [sourceLang: string, targetLang: string]
) {
    const untranslated = untranslatedMarker(sourceLang, targetLang);
    const same = equality();
    const parsed = new Map<string, unknown>();
    const rawBefore = object(parse(previous.get(root)!)),
        rawAfter = object(parse(graph.get(root)!));
    if (!isDeepStrictEqual({...rawBefore, paths: null}, {...rawAfter, paths: null})) {
        return undefined;
    }
    const oldPaths = object(rawBefore.paths),
        newPaths = object(rawAfter.paths);
    if (Object.keys(oldPaths).some((k) => !isDeepStrictEqual(oldPaths[k], newPaths[k]))) {
        return undefined;
    }
    const before = readContractGraph(root, previous, parsed).api.paths as Obj;
    const after = readContractGraph(root, graph, parsed).api.paths as Obj;
    const added = Object.keys(after).filter(
        (k) => !Object.prototype.hasOwnProperty.call(before, k),
    );
    if (
        added.length !== 1 ||
        Object.keys(before).some((k) => !Object.prototype.hasOwnProperty.call(after, k))
    ) {
        return undefined;
    }
    const [path] = added;
    if (
        !isDeepStrictEqual(
            Object.keys(newPaths).filter((k) => !Object.prototype.hasOwnProperty.call(oldPaths, k)),
            [path],
        )
    ) {
        return undefined;
    }
    const operation = object(after[path]);
    if (
        Object.keys(operation).length !== 1 ||
        !/^(get|put|post|delete|options|head|patch|trace)$/.test(Object.keys(operation)[0])
    ) {
        return undefined;
    }
    const target = object(parse(current));
    const targets = object(target.paths);
    if (Object.prototype.hasOwnProperty.call(targets, path)) {
        throw new Error('Target already contains the new OpenAPI path');
    }
    const method = Object.keys(operation)[0];
    const id = object(operation[method]).operationId;
    if (
        typeof id !== 'string' ||
        Object.values(targets).some((v) =>
            Object.values(object(v)).some(
                (op) => op && typeof op === 'object' && !Array.isArray(op) && op.operationId === id,
            ),
        )
    ) {
        throw new Error('Missing or duplicate operationId');
    }
    const units = new Map<string, number>();
    const register = (text: string) => {
        if (!units.has(text)) {
            units.set(text, units.size);
        }
    };
    const patches: {route: string; old: string; title: string}[] = [];
    for (const k of Object.keys(before)) {
        if (same(before[k], after[k])) {
            continue;
        }
        const old = object(before[k]),
            next = object(after[k]);
        if (
            !isDeepStrictEqual(
                Object.keys(old).sort((left, right) => left.localeCompare(right)),
                Object.keys(next).sort((left, right) => left.localeCompare(right)),
            )
        ) {
            throw new Error('Another operation also changed');
        }
        for (const verb of Object.keys(old)) {
            if (same(old[verb], next[verb])) {
                continue;
            }
            const a = object(old[verb]),
                b = object(next[verb]);
            if (
                !same({...a, description: null}, {...b, description: null}) ||
                typeof a.description !== 'string' ||
                typeof b.description !== 'string'
            ) {
                throw new Error('Another operation contract also changed');
            }
            const x = a.description.split('\n'),
                y = b.description.split('\n');
            const changes = x.map((line, i) => (line !== y[i] ? i : -1)).filter((i) => i >= 0);
            if (x.length !== y.length || changes.length !== 1) {
                throw new Error('Expected one note title change');
            }
            const i = changes[0],
                left = noteTitle(x[i]),
                right = noteTitle(y[i]);
            if (!left || !right || left.prefix !== right.prefix || left.suffix !== right.suffix) {
                throw new Error('Existing description change is not a note title');
            }
            const localized = object(object(targets[k])[verb]);
            if (
                localized.operationId !== a.operationId ||
                typeof localized.description !== 'string' ||
                localized.description.split('\n').filter((l) => l === x[i]).length !== 1
            ) {
                throw new Error('Existing target note does not match the previous source');
            }
            patches.push({route: k, old: x[i], title: right.title});
            register(right.title);
        }
    }
    // A pre-existing translation of an identical text is reused only when all
    // aligned occurrences agree. This keeps shared response descriptions intact.
    const memory = new Map<string, string | null>();
    const pointer = '/paths/' + escape(path);
    const pending = new Set<string>();
    visit(
        operation,
        pointer,
        (text) => {
            pending.add(text);
            return text;
        },
        new Set(),
    );
    const signatures = new Map<string, ReturnType<typeof markup> | null>();
    const signature = (text: string) => {
        if (!signatures.has(text)) {
            try {
                signatures.set(text, markup(text));
            } catch {
                signatures.set(text, null);
            } // An unreadable old translation cannot seed a new field.
        }
        return signatures.get(text);
    };
    function remember(src: Value, dst: Value | undefined, pointer: string, trail: Set<object>) {
        if (typeof src === 'string') {
            if (
                pending.has(src) &&
                typeof dst === 'string' &&
                isTextPointer(pointer) &&
                src !== dst &&
                !untranslated?.test(yfmProse(dst)) &&
                Array.isArray(signature(src)) &&
                isDeepStrictEqual(signature(src), signature(dst))
            ) {
                memory.set(src, !memory.has(src) || memory.get(src) === dst ? dst : null);
            }
            return;
        }
        if (!src || !dst || typeof src !== 'object' || typeof dst !== 'object' || trail.has(src)) {
            return;
        }
        trail.add(src);
        for (const [key, val] of Object.entries(src)) {
            remember(val, (dst as Obj)[key], pointer + '/' + escape(key), trail);
        }
        trail.delete(src);
    }
    // Translation memory must describe the same unchanged contract. Use the
    // referenced common fields within corresponding, unchanged methods.
    if (patches.length !== 1) {
        throw new Error('Could not align the changed note title');
    }
    const latestFile = live.get(changedNote.file);
    const oldFile = previous.get(changedNote.file);
    const newFile = graph.get(changedNote.file)!;
    if (
        latestFile !== oldFile &&
        latestFile !== newFile &&
        !(latestFile && sameChangedNote(newFile, latestFile, changedNote.header))
    ) {
        throw new Error('Current source changed the selected note');
    }
    const liveRoot = live.get(root);
    if (!liveRoot) {
        throw new Error('Missing current OpenAPI root');
    }
    const currentPaths = object(object(parse(liveRoot)).paths);
    const oldRegistration = same(currentPaths[path], oldPaths[path]);
    if (!oldRegistration && !same(currentPaths[path], newPaths[path])) {
        throw new Error('Current source changed the new path registration');
    }
    for (const patch of patches) {
        if (!same(currentPaths[patch.route], newPaths[patch.route])) {
            throw new Error('Current source changed the note path registration');
        }
    }
    // Resolve only the new operation against current dependencies. An addition
    // may be planned before the new root registration and files are published.
    const dependencies = new Map(live);
    if (oldRegistration) {
        for (const [file, content] of graph) {
            if (!previous.has(file) && !dependencies.has(file)) {
                dependencies.set(file, content);
            }
        }
    }
    dependencies.set(root, stringify({...rawAfter, paths: {[path]: newPaths[path]}}));
    if (!same(readContractGraph(root, dependencies, parsed).api.paths, {[path]: operation})) {
        throw new Error('Current source changed the operation or its dependencies');
    }
    for (const k of Object.keys(before)) {
        if (targets[k] && same(before[k], after[k])) {
            remember(before[k], targets[k], '/paths/' + escape(k), new Set());
        }
    }
    function visit(
        v: Value,
        ptr: string,
        translate: (u: string) => string,
        trail: Set<object>,
    ): Value {
        if (typeof v === 'string' && isTextPointer(ptr)) {
            return translate(v);
        }
        if (!v || typeof v !== 'object') {
            return v;
        }
        if (trail.has(v)) {
            throw new Error('Cannot inline a recursive operation into the target');
        }
        trail.add(v);
        const out: Value = Array.isArray(v)
            ? v.map((x, i) => visit(x, ptr + '/' + i, translate, trail))
            : Object.fromEntries(
                  Object.entries(v).map(([k, x]) => [
                      k,
                      visit(x, ptr + '/' + escape(k), translate, trail),
                  ]),
              );
        trail.delete(v);
        return out;
    }
    const planner = textPlanner();
    const renderers = new Map<string, ReturnType<typeof planner.prepare>>();
    for (const text of pending) {
        if (memory.get(text) || (untranslated && !untranslated.test(yfmProse(text)))) {
            continue;
        }
        renderers.set(text, planner.prepare(text));
    }
    for (const fragment of planner.fragments) {
        register(fragment);
    }
    const fragments = [...units.keys()];
    return {
        fragments,
        apply(translations: readonly string[]) {
            for (const [i, text] of translations.entries()) {
                if (untranslated?.test(yfmProse(text))) {
                    throw new Error('Untranslated prose in fragment ' + (i + 1));
                }
            }
            const translate = (v: string) => {
                const t = translations[units.get(v)!];
                if (!t) {
                    throw new Error('Missing translated segment');
                }
                return t;
            };
            const localized = planner.fragments.map(translate);
            const translated = visit(
                operation,
                pointer,
                (text) => memory.get(text) ?? renderers.get(text)?.(localized) ?? text,
                new Set(),
            );
            let output = current;
            for (const patch of patches) {
                const b = routeBlock(output, patch.route),
                    n = noteTitle(patch.old)!;
                const value = translate(patch.title);
                if (/["{}\r\n]/.test(value) || b.text.split(patch.old).length !== 2) {
                    throw new Error('Target note is ambiguous');
                }
                output =
                    output.slice(0, b.start) +
                    b.text.replace(patch.old, () => n.prefix + value + n.suffix) +
                    output.slice(b.end);
            }
            const keys = Object.keys(after),
                anchor = keys
                    .slice(keys.indexOf(path) + 1)
                    .find((k) => Object.prototype.hasOwnProperty.call(targets, k));
            const last = Object.keys(targets).at(-1);
            if (!anchor && !last) {
                throw new Error('Target paths are empty');
            }
            const at = anchor ? routeBlock(output, anchor).start : routeBlock(output, last!).end;
            const block =
                stringify({[path]: translated}, {aliasDuplicateObjects: false, lineWidth: 0})
                    .trimEnd()
                    .split('\n')
                    .map((l) => (l ? '  ' + l : l))
                    .join('\n') + '\n';
            const patched = output.slice(0, at) + block + output.slice(at);
            const parsed = object(parse(patched));
            if (!same(object(parsed.paths)[path], translated)) {
                throw new Error('Cannot round-trip new route');
            }
            return patched;
        },
    };
}
