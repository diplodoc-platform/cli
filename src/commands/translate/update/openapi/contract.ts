import {isDeepStrictEqual} from 'node:util';
import {type Node, isMap, isScalar, isSeq} from 'yaml';

import {
    type Address,
    type ObjectValue,
    conflict,
    equality,
    object,
    pointer,
    readContractGraph,
    valueAt,
} from './graph';
import {markup, textPlanner, textValue, trimTrailing} from './annotations';
import {YamlEdits, child, property, readTarget, yamlAt} from './yaml-edits';
import {isTextPointer} from './text-fields';

type SourceGraph = ReturnType<typeof readContractGraph>;
type Change = {address: Address; old: unknown; next: unknown};
type Projection = {fragments: readonly string[]; apply(translated: readonly string[]): string};
const methods = new Set(['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace']);
const bullet =
    /^([*-] )(:no-translate\[)?`([A-Za-z][A-Za-z0-9_]*)`(\]?) ([:\-–—]|:no-translate\[[:\-–—]\]) (.+)$/;

function annotation(address: Address) {
    const path = pointer(address);
    return (
        isTextPointer(path) ||
        /^\/components\/securitySchemes\/[^/]+\/flows\/[^/]+\/scopes\/[^/]+$/.test(path)
    );
}

function simpleList(value: unknown): value is (string | number | boolean | null)[] {
    return (
        Array.isArray(value) &&
        value.every(
            (entry) => entry === null || ['string', 'number', 'boolean'].includes(typeof entry),
        )
    );
}

function operations(value: unknown): [string, ObjectValue][] {
    return object(value)
        ? Object.entries(value).filter(
              (entry): entry is [string, ObjectValue] => methods.has(entry[0]) && object(entry[1]),
          )
        : [];
}

function differences(
    old: unknown,
    next: unknown,
    address: Address,
    same: ReturnType<typeof equality>,
    output: Change[],
    trail = new Map<object, object>(),
) {
    if (same(old, next)) {
        return;
    }
    if (object(old) && object(next)) {
        if (trail.has(old)) {
            if (trail.get(old) !== next) {
                conflict('changed recursive source schema', address);
            }
            return;
        }
        trail.set(old, next);
        for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
            differences(
                valueAt(old, [key]),
                valueAt(next, [key]),
                [...address, key],
                same,
                output,
                trail,
            );
        }
        trail.delete(old);
        return;
    }
    if (
        Array.isArray(old) &&
        Array.isArray(next) &&
        old.length === next.length &&
        !simpleList(old) &&
        !simpleList(next)
    ) {
        old.forEach((value, index) =>
            differences(value, next[index], [...address, index], same, output, trail),
        );
        return;
    }
    output.push({address, old, next});
}

function definitionChanges(
    before: SourceGraph,
    after: SourceGraph,
    target: Node,
    same: ReturnType<typeof equality>,
) {
    const components = yamlAt(target, ['components']);
    const changes: Change[] = [];
    if (!isMap(components)) {
        return changes;
    }
    for (const collection of components.items) {
        if (
            !isScalar(collection.key) ||
            typeof collection.key.value !== 'string' ||
            !isMap(collection.value)
        ) {
            continue;
        }
        for (const {key} of collection.value.items) {
            if (!isScalar(key) || typeof key.value !== 'string') {
                continue;
            }
            const name = key.value;
            const address = ['components', collection.key.value, name];
            // Legacy bundles also publish copies of named definitions from
            // reference fragments. Only update names with proven source identity.
            if (
                valueAt(before.api, address) !== undefined ||
                valueAt(after.api, address) !== undefined
            ) {
                continue;
            }
            const a = before.definitions.get(name) ?? [];
            const b = after.definitions.get(name) ?? [];
            const first = a.map(before.expandDefinition);
            const second = b.map(after.expandDefinition);
            if (
                first.length === second.length &&
                a.every(({file}, index) => {
                    const updated = b.findIndex((site) => site.file === file);
                    return updated >= 0 && same(first[index], second[updated]);
                })
            ) {
                continue;
            }
            if (first.length > 1 || second.length > 1) {
                conflict('ambiguous legacy component definition', address);
            }
            if (first.length === 1 && second.length === 1) {
                differences(first[0], second[0], address, same, changes);
            }
        }
    }
    return changes;
}

function declaredDefinition(graph: SourceGraph, address: Address) {
    const value = valueAt(graph.api, address);
    if (value !== undefined || address[0] !== 'components' || address.length < 3) {
        return value;
    }
    const sites = graph.definitions.get(String(address[2])) ?? [];
    if (sites.length > 1) {
        conflict('ambiguous current component definition', address.slice(0, 3));
    }
    return sites.length ? valueAt(graph.expandDefinition(sites[0]), address.slice(3)) : undefined;
}

type TextPlanner = ReturnType<typeof textPlanner>;

function sameLocalizedFrame(before: unknown, target: Node | undefined, address: Address): boolean {
    if (Array.isArray(before)) {
        return (
            isSeq(target) &&
            before.length === target.items.length &&
            before.every((value, i) =>
                sameLocalizedFrame(value, child(target, i, address), [...address, i]),
            )
        );
    }
    if (object(before)) {
        return (
            isMap(target) &&
            target.items.every(
                ({key}) =>
                    isScalar(key) &&
                    (annotation([...address, String(key.value)]) ||
                        Object.prototype.hasOwnProperty.call(before, String(key.value))),
            ) &&
            Object.entries(before).every(
                ([key, value]) =>
                    annotation([...address, key]) ||
                    sameLocalizedFrame(value, child(target, key, address), [...address, key]),
            )
        );
    }
    return isScalar(target) && Object.is(before, target.value);
}

function collectLocalized(
    before: unknown,
    target: Node | undefined,
    address: Address,
    translations: Map<string, string | undefined>,
    ancestors = new Set<object>(),
) {
    if (
        (!object(before) && !Array.isArray(before)) ||
        ancestors.has(before) ||
        (!isMap(target) && !isSeq(target))
    ) {
        return;
    }
    if (isMap(target) && target.has('$ref')) {
        return;
    }
    if (
        object(before) &&
        typeof before.operationId === 'string' &&
        (!isMap(target) || target.get('operationId') !== before.operationId)
    ) {
        return;
    }

    ancestors.add(before);
    let ownerMatches: boolean | undefined;
    for (const [key, value] of Object.entries(before)) {
        const step = Array.isArray(before) ? Number(key) : key;
        const at = [...address, step];
        const localized = child(target, step, address);
        if (typeof value === 'string' && annotation(at)) {
            if (!(ownerMatches ??= sameLocalizedFrame(before, target, address))) {
                continue;
            }
            if (!isScalar(localized) || !textValue(localized.value)) {
                continue;
            }
            if (!translations.has(value)) {
                translations.set(value, localized.value);
            } else if (translations.get(value) !== localized.value) {
                translations.set(value, undefined);
            }
        } else if (object(value) || Array.isArray(value)) {
            if (
                Array.isArray(before) &&
                (!isSeq(target) ||
                    before.length !== target.items.length ||
                    !sameLocalizedFrame(value, localized, at) ||
                    before.some(
                        (other, i) => i !== step && sameLocalizedFrame(other, localized, at),
                    ) ||
                    target.items.some(
                        (_, i) =>
                            i !== step && sameLocalizedFrame(value, child(target, i, address), at),
                    ))
            ) {
                // An array index alone does not prove a parameter or variant's identity.
                continue;
            }
            collectLocalized(value, localized, at, translations, ancestors);
        }
    }
    ancestors.delete(before);
}

function newValue(
    next: unknown,
    address: Address,
    planner: TextPlanner,
    localized: Map<string, string | undefined>,
    trail = new Map<object, Address>(),
): (translated: readonly string[]) => unknown {
    if (typeof next === 'string' && annotation(address)) {
        const reused = localized.get(next);
        return reused === undefined ? planner.prepare(next) : () => reused;
    }
    if (!object(next) && !Array.isArray(next)) {
        return () => next;
    }
    const prior = trail.get(next);
    if (prior) {
        const ref = '#' + encodeURI(pointer(prior)).replace(/#/g, '%23');
        return () => ({$ref: ref});
    }
    trail.set(next, address);
    if (Array.isArray(next)) {
        const items = next.map((entry, i) =>
            newValue(entry, [...address, i], planner, localized, trail),
        );
        trail.delete(next);
        return (translated) => items.map((item) => item(translated));
    }
    const entries = Object.entries(next).map(
        ([key, entry]) =>
            [key, newValue(entry, [...address, key], planner, localized, trail)] as const,
    );
    trail.delete(next);
    return (translated) =>
        Object.fromEntries(entries.map(([key, render]) => [key, render(translated)]));
}

function operationIdIndex(root: Node) {
    const paths = yamlAt(root, ['paths']);
    if (!isMap(paths)) {
        return conflict('invalid target paths');
    }
    const positions = new Map<string, Address[]>();
    for (const path of paths.items) {
        if (!isScalar(path.key) || !isMap(path.value)) {
            continue;
        }
        for (const op of path.value.items) {
            if (!isScalar(op.key) || !methods.has(String(op.key.value)) || !isMap(op.value)) {
                continue;
            }
            const id = op.value.get('operationId');
            if (typeof id !== 'string') {
                continue;
            }
            const uses = positions.get(id) ?? [];
            uses.push(['paths', String(path.key.value), String(op.key.value)]);
            positions.set(id, uses);
        }
    }
    return positions;
}

function sourceIdCounts(graph: SourceGraph) {
    const counts = new Map<string, number>();
    for (const route of Object.values(graph.api.paths as ObjectValue)) {
        for (const [, op] of operations(route)) {
            if (typeof op.operationId === 'string') {
                counts.set(op.operationId, (counts.get(op.operationId) ?? 0) + 1);
            }
        }
    }
    return counts;
}

function verifyRoute(
    change: Change,
    before: SourceGraph,
    after: SourceGraph,
    current: SourceGraph,
    target: Node,
    targetIds: Map<string, Address[]>,
    beforeIds: Map<string, number>,
    afterIds: Map<string, number>,
) {
    const {address} = change;
    if (address[0] !== 'paths' || address.length < 2) {
        return;
    }
    const route = address.slice(0, 2);
    const oldPath = valueAt(before.api, route);
    const nextPath = valueAt(after.api, route);
    const previous = new Map(operations(oldPath));
    const methods = new Map([...operations(nextPath), ...previous]);
    for (const [verb, operation] of methods) {
        if (address.length > 2 && address[2] !== verb) {
            continue;
        }
        const at = [...route, verb];
        const id = operation.operationId;
        const currentId = valueAt(current.api, [...at, 'operationId']);
        const nextId = valueAt(after.api, [...at, 'operationId']);
        if (previous.has(verb) && nextId !== id) {
            conflict('unsupported existing operation identity change', at);
        }
        if (
            typeof id !== 'string' ||
            (currentId !== id && !(!previous.has(verb) && currentId === undefined))
        ) {
            conflict('source operation identity changed or is missing', at);
        }
        if ((beforeIds.get(id) ?? 0) > 1 || (afterIds.get(id) ?? 0) > 1) {
            conflict('source operation identity is ambiguous', at);
        }
        const uses = targetIds.get(id) ?? [];
        const localized = yamlAt(target, at);
        if (
            localized === undefined &&
            (!previous.has(verb) || operation['x-hidden'] === true) &&
            !uses.length
        ) {
            continue;
        }
        if (uses.length !== 1 || !isDeepStrictEqual(uses[0], at)) {
            conflict('target operation identity is missing or ambiguous', at);
        }
    }
}

function publishedMissingRoutes(
    changes: Change[],
    before: SourceGraph,
    after: SourceGraph,
    target: Node,
): Change[] {
    const missing = new Map<string, Change>();
    return changes.flatMap((change) => {
        const [section, route, method] = change.address;
        if (
            section !== 'paths' ||
            typeof route !== 'string' ||
            typeof method !== 'string' ||
            !methods.has(method)
        ) {
            return [change];
        }
        const at = [section, route, method];
        if (yamlAt(target, at) !== undefined) {
            return [change];
        }
        const old = valueAt(before.api, at);
        const next = valueAt(after.api, at);
        if (
            !object(old) ||
            !object(next) ||
            old['x-hidden'] !== true ||
            next['x-hidden'] === true ||
            old.operationId !== next.operationId
        ) {
            return [change];
        }
        const address = yamlAt(target, at.slice(0, 2)) === undefined ? at.slice(0, 2) : at;
        const slot = pointer(address);
        if (missing.has(slot)) {
            return [];
        }
        if (address.length === 2) {
            const previousMethods = operations(valueAt(before.api, address));
            const updatedMethods = operations(valueAt(after.api, address));
            if (
                previousMethods.length !== updatedMethods.length ||
                previousMethods.some(([verb, op]) => {
                    const updated = updatedMethods.find(([method]) => method === verb)?.[1];
                    return (
                        op['x-hidden'] !== true ||
                        !updated ||
                        updated['x-hidden'] === true ||
                        updated.operationId !== op.operationId
                    );
                })
            ) {
                conflict('cannot publish an omitted path with unrelated operations', address);
            }
        }
        const combined = {address, old: undefined, next: valueAt(after.api, address)};
        missing.set(slot, combined);
        return [combined];
    });
}

function sequenceRange(old: unknown[], next: unknown[]) {
    let from = 0;
    let to = old.length;
    let end = next.length;
    while (from < to && from < end && Object.is(old[from], next[from])) {
        from++;
    }
    while (to > from && end > from && Object.is(old[to - 1], next[end - 1])) {
        to--;
        end--;
    }
    return {from, to, replacement: next.slice(from, end)};
}

// Preserve the original spelling and comments of retained entries when their
// order stays the same. Reordering falls back to one contiguous replacement.
function sequenceEdits(old: unknown[], next: unknown[]) {
    const common = old.filter((value) => next.includes(value));
    if (
        new Set(old).size !== old.length ||
        new Set(next).size !== next.length ||
        !isDeepStrictEqual(
            common,
            next.filter((value) => old.includes(value)),
        )
    ) {
        return [sequenceRange(old, next)];
    }
    let from = 0;
    let nextFrom = 0;
    const edits = [];
    for (const value of [...common, undefined]) {
        const to = value === undefined ? old.length : old.indexOf(value, from);
        const nextTo = value === undefined ? next.length : next.indexOf(value, nextFrom);
        if (from !== to || nextFrom !== nextTo) {
            edits.push({from, to, replacement: next.slice(nextFrom, nextTo)});
        }
        from = to + 1;
        nextFrom = nextTo + 1;
    }
    return edits;
}

function appendParagraphs(change: Change, field: Node, edits: YamlEdits, planner: TextPlanner) {
    if (
        !textValue(change.old) ||
        !textValue(change.next) ||
        !isScalar(field) ||
        !textValue(field.value)
    ) {
        return false;
    }
    const old = trimTrailing(change.old);
    const next = trimTrailing(change.next);
    const boundary = old + '\n\n';
    if (!next.startsWith(boundary)) {
        return false;
    }
    const anchor = markup(old);
    if (
        !anchor.length ||
        !isDeepStrictEqual(anchor, markup(field.value)) ||
        old.split(/\n\n+/).length !== trimTrailing(field.value).split(/\n\n+/).length
    ) {
        conflict('appended prose has no verified target paragraph', change.address);
    }
    edits.appendLiteral(field, planner.prepare(next.slice(boundary.length)), change.address);
    return true;
}

function enumExplanation(
    change: Change,
    enumChange: Change | undefined,
    target: string,
    node: Node,
    edits: YamlEdits,
    planner: TextPlanner,
): boolean {
    if (
        !enumChange ||
        !simpleList(enumChange.old) ||
        !simpleList(enumChange.next) ||
        !textValue(change.old) ||
        !textValue(change.next)
    ) {
        return false;
    }
    const values = sequenceRange(enumChange.old, enumChange.next);
    if (values.from !== values.to || values.replacement.length !== 1 || !values.from) {
        return false;
    }
    const added = values.replacement[0];
    const previous = enumChange.old[values.from - 1];
    if (typeof added !== 'string' || typeof previous !== 'string') {
        return false;
    }
    const old = change.old.split('\n');
    const next = change.next.split('\n');
    const addedLine = next.findIndex((line) => bullet.exec(line)?.[3] === added);
    const source = addedLine >= 0 ? bullet.exec(next[addedLine]) : null;
    if (
        !source ||
        addedLine < 1 ||
        bullet.exec(next[addedLine - 1])?.[3] !== previous ||
        [...next.slice(0, addedLine), ...next.slice(addedLine + 1)].join('\n') !== old.join('\n')
    ) {
        return false;
    }
    if (
        !isScalar(node) ||
        node.type !== 'BLOCK_LITERAL' ||
        node.anchor ||
        node.tag ||
        !node.range
    ) {
        conflict('enum explanation is not a literal block', change.address);
    }
    const [from, to] = node.range;
    const raw = target.slice(from, to);
    const lines = [...raw.matchAll(/([^\r\n]*)(\r\n|\n|$)/g)];
    const anchors = lines.filter((line) => bullet.exec(line[1].trimStart())?.[3] === previous);
    if (
        anchors.length !== 1 ||
        lines.some((line) => bullet.exec(line[1].trimStart())?.[3] === added)
    ) {
        conflict('target enum explanation has no unique anchor', change.address);
    }
    const [anchor] = anchors;
    const adjacent = bullet.exec(anchor[1].trimStart())!;
    const indent = anchor[1].match(/^ */)![0];
    if (!anchor[2] || !indent) {
        conflict('invalid enum explanation indentation', change.address);
    }
    const prefix =
        indent +
        adjacent[1] +
        (adjacent[2] ?? '') +
        '`' +
        added +
        '`' +
        adjacent[4] +
        ' ' +
        adjacent[5] +
        ' ';
    const prose = planner.prepare(source[6]);
    const at = from + anchor.index! + anchor[1].length;
    edits.add(at, at, (translations) => {
        const value = prose(translations);
        if (/[\r\n]/.test(value)) {
            conflict('enum explanation must remain one line', change.address);
        }
        return anchor[2] + prefix + value;
    });
    return true;
}

/** Apply semantic source changes to their proven locations in an existing localized bundle. */
export function planOpenApiContract(
    root: string,
    beforeGraph: ReadonlyMap<string, string>,
    afterGraph: ReadonlyMap<string, string>,
    currentGraph: ReadonlyMap<string, string>,
    target: string,
): Projection | undefined {
    const parsed = new Map<string, unknown>();
    const before = readContractGraph(root, beforeGraph, parsed);
    const after = readContractGraph(root, afterGraph, parsed);
    const same = equality();
    const changes: Change[] = [];
    differences(before.api, after.api, [], same, changes);
    const edits = new YamlEdits(target);
    const targetRoot = readTarget(target);
    changes.push(...definitionChanges(before, after, targetRoot, same));
    if (!changes.length) {
        return undefined;
    }
    const current =
        currentGraph === beforeGraph
            ? before
            : currentGraph === afterGraph
              ? after
              : readContractGraph(root, currentGraph, parsed);
    const planner = textPlanner();
    const targetIds = operationIdIndex(targetRoot);
    const beforeIds = sourceIdCounts(before);
    const afterIds = sourceIdCounts(after);
    const localized = new Map<string, string | undefined>();
    const selected = publishedMissingRoutes(changes, before, after, targetRoot);
    if (
        selected.some(({old, next}) => old === undefined && (object(next) || Array.isArray(next)))
    ) {
        collectLocalized(before.api, targetRoot, [], localized);
    }
    const selectedByPath = new Map(selected.map((change) => [pointer(change.address), change]));
    for (const change of selected) {
        const {address, old, next} = change;
        if (address.length < 2) {
            conflict('unsupported root field change', address);
        }
        verifyRoute(change, before, after, current, targetRoot, targetIds, beforeIds, afterIds);
        const currentValue = declaredDefinition(current, address);
        if (!same(currentValue, declaredDefinition(before, address)) && !same(currentValue, next)) {
            conflict('source value changed in the current source', address);
        }
        const parentPath = address.slice(0, -1);
        const key = address.at(-1)!;
        const parent = yamlAt(targetRoot, parentPath);
        if (!isMap(parent) || parent.has('$ref') || parent.anchor || parent.tag) {
            conflict('unmapped or ambiguous target field', address);
        }
        const entry = property(parent, key, parentPath);
        const field = entry?.value as Node | undefined;
        if (old === undefined) {
            if (entry) {
                conflict('target already contains added field', address);
            }
            edits.insertMapping(
                parent,
                String(key),
                newValue(next, address, planner, localized),
                address,
            );
            continue;
        }
        if (!entry || !field) {
            conflict('target is missing the changed field', address);
        }
        const isText = typeof old === 'string' && annotation(address);
        if (
            isText &&
            typeof next === 'string' &&
            (enumExplanation(
                change,
                selectedByPath.get(pointer([...parentPath, 'enum'])),
                target,
                field,
                edits,
                planner,
            ) ||
                appendParagraphs(change, field, edits, planner))
        ) {
            continue;
        }
        const targetValue: unknown = field.toJSON();
        if (isText) {
            if (!textValue(targetValue) || !isDeepStrictEqual(markup(old), markup(targetValue))) {
                conflict('target annotation has changed structure', address);
            }
            if (next !== undefined && !markup(old).length && targetValue !== old) {
                conflict('changed prose has no shared target anchor', address);
            }
        } else if (!isDeepStrictEqual(targetValue, old)) {
            conflict('target value differs from the source baseline', address);
        }
        if (next === undefined) {
            if (parent.items.length === 1) {
                conflict('removal would leave an empty mapping', address);
            }
            edits.omitMapping(entry.key as Node, field, address);
        } else if (simpleList(old) && simpleList(next) && isSeq(field)) {
            for (const {from, to, replacement} of sequenceEdits(old, next)) {
                edits.sequence(field, from, to, replacement, address);
            }
        } else {
            edits.replaceScalar(
                entry.key as Node,
                field,
                newValue(next, address, planner, localized),
                address,
            );
        }
    }
    return {
        fragments: planner.fragments,
        apply(translated) {
            if (translated.length !== planner.fragments.length) {
                conflict('incomplete translated fragments');
            }
            return edits.apply(translated);
        },
    };
}
