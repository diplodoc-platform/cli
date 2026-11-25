import {posix} from 'node:path';
import {type YAMLMap, isMap, isScalar, isSeq, parseDocument, visit} from 'yaml';

import {localGuideLinkProtection, planGuideDelta, planLinkedParagraphDeletion} from './guide';
import {
    type Literal,
    type Paragraph,
    type TextEdit,
    changedRange,
    comparisonText,
    conflict,
    keepsProtections,
    literalScalar,
    paragraph,
    preserveTargetProtections,
    protectedSpans,
    readInline,
    readLiteral,
    readParagraphs,
    sameStructure,
} from './literal';
import {pointerTokens} from './graph';

export type PathItem = {
    route: string;
    address: readonly string[];
};

type Operation = {
    id: string;
    method: string;
    path?: string;
    description: unknown;
};

const methods = new Set(['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace']);
function readDocument(text: string) {
    const document = parseDocument(text);
    if (document.errors.length || document.warnings.length || !isMap(document.contents)) {
        conflict('invalid YAML');
    }
    return document;
}

function rootPaths(document: ReturnType<typeof readDocument>) {
    const version = document.get('openapi');
    const paths = document.get('paths', true);
    if (typeof version !== 'string' || !version.startsWith('3.0.') || !isMap(paths)) {
        return conflict('unsupported OpenAPI document');
    }
    return paths;
}

/** Bind a file to its path item when the specification identifies it uniquely. */
export function indexPathItems(root: string) {
    const paths = rootPaths(readDocument(root));
    const bindings = new Map<string, PathItem | undefined>();
    for (const {key, value} of paths.items) {
        if (!isMap(value)) {
            continue;
        }
        const reference = value.get('$ref');
        if (typeof reference !== 'string') {
            continue;
        }
        const [file, fragment = '', ...rest] = reference.split('#');
        if (!file || posix.isAbsolute(file) || /^[\w+.-]+:/.test(file) || /[?\\]/.test(file)) {
            continue;
        }
        const name = posix.normalize(decodeURIComponent(file));
        const unique =
            !bindings.has(name) &&
            !rest.length &&
            value.items.length === 1 &&
            isScalar(key) &&
            typeof key.value === 'string' &&
            key.value.startsWith('/');
        bindings.set(
            name,
            unique && isScalar(key)
                ? {route: String(key.value), address: pointerTokens(decodeURIComponent(fragment))}
                : undefined,
        );
    }
    return bindings;
}

function operations(text: string, fragment?: PathItem): Operation[] {
    return documentOperations(readDocument(text), fragment);
}

function documentOperations(
    document: ReturnType<typeof readDocument>,
    fragment?: PathItem,
): Operation[] {
    const collect = (pathItem: YAMLMap, path?: string): Operation[] =>
        pathItem.items.flatMap(({key, value}) => {
            if (!isScalar(key) || typeof key.value !== 'string' || !methods.has(key.value)) {
                return [];
            }
            if (!isMap(value)) {
                conflict('invalid operation mapping');
            }
            const operationId = value.get('operationId', true);
            if (operationId === undefined) {
                return [];
            }
            if (
                !isScalar(operationId) ||
                typeof operationId.value !== 'string' ||
                !operationId.value.trim()
            ) {
                conflict('invalid operationId');
            }
            return [
                {
                    id: operationId.value,
                    method: key.value,
                    path,
                    description: value.get('description', true),
                },
            ];
        });

    if (fragment) {
        const node = fragment.address.length
            ? document.getIn(fragment.address, true)
            : document.contents;
        return isMap(node) ? collect(node, fragment.route) : [];
    }
    return rootPaths(document).items.flatMap(({key, value}) => {
        if (!isScalar(key) || typeof key.value !== 'string') {
            return conflict('invalid path');
        }
        if (!key.value.startsWith('/')) {
            return [];
        }
        if (!isMap(value)) {
            return conflict('invalid path mapping');
        }
        return collect(value, key.value);
    });
}

function sameOperation(left: Operation, right: Operation) {
    return left.id === right.id && left.method === right.method && left.path === right.path;
}

function changedOperationDescriptions(beforeOperations: Operation[], afterOperations: Operation[]) {
    return beforeOperations.flatMap((operation) => {
        const oldValue = literalScalar(operation.description);
        const candidate = afterOperations.find((next) => sameOperation(operation, next));
        const newValue = literalScalar(candidate?.description);
        if (!oldValue || !newValue || oldValue.value === newValue.value) {
            return [];
        }
        return [{operation, oldValue, newValue}];
    });
}

/** Select byte-local description edits only when every source change is accounted for. */
export function isDescriptionChange(before: string, after: string, fragment?: PathItem): boolean {
    const oldDoc = readDocument(before);
    const newDoc = readDocument(after);
    const changed = changedOperationDescriptions(
        documentOperations(oldDoc, fragment),
        documentOperations(newDoc, fragment),
    );
    if (!changed.length || (!fragment && changed.length !== 1)) {
        return false;
    }
    const schema = fragment
        ? readSchemaDescriptionChanges(before, after, oldDoc, newDoc, fragment)
        : [];
    const bodies = [
        ...changed.map(({oldValue, newValue}) => ({
            oldBody: readLiteral(before, oldValue),
            newBody: readLiteral(after, newValue),
        })),
        ...schema,
    ];
    return (
        withoutBodies(
            before,
            bodies.map(({oldBody}) => oldBody),
        ) ===
        withoutBodies(
            after,
            bodies.map(({newBody}) => newBody),
        )
    );
}

function withoutBodies(text: string, bodies: readonly Literal[]) {
    return applyTextEdits(
        text,
        bodies.map(({from, to, header, indent}) => ({from, to, text: header + indent})),
    );
}

function anchor(block: Paragraph, source: Paragraph[], target: Paragraph[]) {
    // An identical include, unique inline token sequence, or exact prose establishes identity.
    const hasIdentity = block.protectedText !== '[]';
    const matches = (candidate: Paragraph) =>
        sameStructure(block, candidate) && (hasIdentity || block.text === candidate.text);
    return source.filter(matches).length === 1 && target.filter(matches).length === 1;
}

type DescriptionProjection = {
    markdown: string;
    apply(translated: string): string;
};
type LiteralProjection = {
    markdown: string;
    apply(translated: string): TextEdit[];
};

/** Each item occupies one physical line and uses the same top-level bullet marker. */
function flatListItems(block: Paragraph, literal: Literal): Paragraph[] | undefined {
    const marker = block.text.match(/^[*+-] /)?.[0];
    if (!marker) {
        return undefined;
    }
    const items: Paragraph[] = [];
    const raw = literal.raw.slice(block.start - literal.from, block.end - literal.from);
    const prefix = literal.indent + marker;
    for (const line of raw.matchAll(/([^\r\n]+)(?:\r\n|\n|$)/g)) {
        if (!line[1].startsWith(prefix)) {
            return undefined;
        }
        const text = line[1].slice(prefix.length);
        const start = block.start + line.index + prefix.length;
        const item = paragraph(text, start, start + text.trimEnd().length);
        if (!item.prose) {
            return undefined;
        }
        items.push(item);
    }
    return items;
}

function translatedParagraphs(translated: string, sources: Paragraph[], targets: Paragraph[]) {
    const normalized = translated.replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
    if (normalized.includes('\r')) {
        conflict('invalid translation line ending');
    }
    const generated = readParagraphs(normalized);
    if (
        generated.length !== sources.length ||
        generated.some((block, index) => {
            const source = sources[index];
            return (
                !sameStructure(source, block) ||
                !keepsProtections(
                    protectedSpans(readInline(source.text)),
                    protectedSpans(readInline(block.text)),
                )
            );
        }) ||
        generated.some((block) =>
            targets.some(
                (existing) => comparisonText(existing.text) === comparisonText(block.text),
            ),
        )
    ) {
        conflict('translation changes paragraph structure or protected text');
    }
    return generated;
}

function planListItemReplacement(
    sourceBefore: Literal,
    sourceAfter: Literal,
    targetDescription: Literal,
    changedBlock: number,
): LiteralProjection | undefined {
    const sourceBlock = sourceBefore.paragraphs[changedBlock];
    const updatedBlock = sourceAfter.paragraphs[changedBlock];
    const targetBlock = targetDescription.paragraphs[changedBlock];
    const beforeItems = flatListItems(sourceBlock, sourceBefore);
    const afterItems = flatListItems(updatedBlock, sourceAfter);
    const targetItems = flatListItems(targetBlock, targetDescription);
    if (!beforeItems || !afterItems || !targetItems) {
        return undefined;
    }

    if (
        beforeItems.length !== afterItems.length ||
        beforeItems.length !== targetItems.length ||
        sourceBlock.text[0] !== updatedBlock.text[0] ||
        beforeItems.some((item, index) => !sameStructure(item, targetItems[index]))
    ) {
        return conflict('flat list item layout differs');
    }

    const {first, oldEnd, newEnd} = changedRange(beforeItems, afterItems);
    if (
        first === 0 ||
        oldEnd !== first + 1 ||
        newEnd !== first + 1 ||
        oldEnd >= beforeItems.length
    ) {
        return conflict('expected one changed item between unchanged flat list items');
    }
    const allSourceItems = sourceBefore.paragraphs.flatMap(
        (block) => flatListItems(block, sourceBefore) ?? [],
    );
    const allTargetItems = targetDescription.paragraphs.flatMap(
        (block) => flatListItems(block, targetDescription) ?? [],
    );
    if (
        ![beforeItems[first - 1], beforeItems[oldEnd]].some((item) =>
            anchor(item, allSourceItems, allTargetItems),
        )
    ) {
        return conflict('changed flat list item has no unique neighboring anchor');
    }

    const previous = beforeItems[first];
    const changed = afterItems[first];
    const markdown = changed.text.trimEnd();
    if (
        previous.text.slice(previous.text.trimEnd().length) !== changed.text.slice(markdown.length)
    ) {
        return conflict('changed flat list item modifies trailing whitespace');
    }
    const localized = targetItems[first];
    return {
        markdown,
        apply(translated) {
            const [item] = translatedParagraphs(
                translated,
                [changed],
                [...targetItems, ...targetDescription.paragraphs],
            );
            if (item.text.includes('\n')) {
                conflict('translated flat list item spans multiple lines');
            }
            return [{from: localized.start, to: localized.end, text: item.text.trimEnd()}];
        },
    };
}

export function planOpenApiDescription(
    before: string,
    after: string,
    target: string,
    currentSource?: string,
): DescriptionProjection {
    const beforeOperations = operations(before);
    const afterOperations = operations(after);
    const changed = changedOperationDescriptions(beforeOperations, afterOperations);
    if (changed.length !== 1) {
        conflict('expected one changed operation description');
    }
    const {operation, oldValue, newValue} = changed[0];
    if (
        beforeOperations.filter((item) => item.id === operation.id).length !== 1 ||
        afterOperations.filter((item) => item.id === operation.id).length !== 1
    ) {
        conflict('source operationId is ambiguous');
    }
    const oldDescription = readLiteral(before, oldValue);
    const newDescription = readLiteral(after, newValue);
    if (
        before.slice(0, oldDescription.from) !== after.slice(0, newDescription.from) ||
        oldDescription.header !== newDescription.header ||
        oldDescription.indent !== newDescription.indent ||
        before.slice(oldDescription.to) !== after.slice(newDescription.to)
    ) {
        conflict('source changes outside the description body');
    }
    if (currentSource !== undefined) {
        const current = operations(currentSource).filter((item) => item.id === operation.id);
        const currentDescription = literalScalar(current[0]?.description)?.value;
        if (
            current.length !== 1 ||
            !sameOperation(operation, current[0]) ||
            (currentDescription !== oldDescription.value &&
                currentDescription !== newDescription.value)
        ) {
            conflict('source operation description changed in the current source');
        }
    }

    const candidates = operations(target).filter((item) => item.id === operation.id);
    if (
        candidates.length !== 1 ||
        candidates[0].method !== operation.method ||
        (operation.path !== undefined && candidates[0].path !== operation.path)
    ) {
        conflict('target operation is missing or ambiguous');
    }
    const projection = planPlainDescription(
        oldDescription,
        newDescription,
        readLiteral(target, candidates[0].description),
    );
    return {
        markdown: projection.markdown,
        apply: (translated) => applyTextEdits(target, projection.apply(translated)),
    };
}

function planPlainDescription(
    oldDescription: Literal,
    newDescription: Literal,
    targetDescription: Literal,
    preserveProtection = false,
): LiteralProjection {
    const oldBlocks = oldDescription.paragraphs;
    const newBlocks = newDescription.paragraphs;
    const targetBlocks = targetDescription.paragraphs;
    if (oldBlocks.length !== targetBlocks.length) {
        conflict('target layout differs from the source before the change');
    }
    const {first, oldEnd, newEnd} = changedRange(oldBlocks, newBlocks);
    const listPlan =
        oldEnd === first + 1 && newEnd === first + 1
            ? planListItemReplacement(oldDescription, newDescription, targetDescription, first)
            : undefined;
    if (
        oldBlocks.some(
            (block, index) =>
                !(listPlan && index === first) && !sameStructure(block, targetBlocks[index]),
        )
    ) {
        conflict('target layout differs from the source before the change');
    }
    if (listPlan) {
        return listPlan;
    }

    const removed = oldBlocks.slice(first, oldEnd);
    const added = newBlocks.slice(first, newEnd);
    if (
        !added.length ||
        [...added, ...removed].some((block) => !block.prose) ||
        added.some((block) => oldBlocks.some((old) => old.text === block.text)) ||
        new Set(added.map((block) => block.text)).size !== added.length
    ) {
        conflict('expected one contiguous edit with new prose paragraphs');
    }
    const anchored = (block?: Paragraph) => block && anchor(block, oldBlocks, targetBlocks);
    if (
        removed.some((block) => !anchored(block)) ||
        (!removed.length && !anchored(oldBlocks[first - 1]) && !anchored(oldBlocks[first]))
    ) {
        conflict('changed prose has no unique target anchor');
    }

    return {
        markdown: added.map((block) => block.text).join('\n\n'),
        apply(translated) {
            const generated = translatedParagraphs(translated, added, targetBlocks);
            const {indent, eol} = targetDescription;
            const paragraphs = generated.map((block, index) =>
                (preserveProtection && removed.length === generated.length
                    ? preserveTargetProtections(block.text, targetBlocks[first + index].text)
                    : block.text
                )
                    .split('\n')
                    .map((line) => indent + line)
                    .join(eol),
            );
            const replacement = paragraphs.join(eol + eol);
            if (removed.length) {
                return [
                    {
                        from: targetBlocks[first].start,
                        to: targetBlocks[oldEnd - 1].end,
                        text: replacement,
                    },
                ];
            }
            const next = targetBlocks[first];
            if (next) {
                return [{from: next.start, to: next.start, text: replacement + eol + eol}];
            }
            const end = targetBlocks[first - 1].end;
            return [{from: end, to: end, text: eol + eol + replacement}];
        },
    };
}

function applyTextEdits(target: string, edits: readonly TextEdit[]): string {
    const parts: string[] = [];
    let from = 0;
    let lastEditStart = -1;
    for (const edit of [...edits].sort((a, b) => a.from - b.from)) {
        if (edit.from < from || edit.from === lastEditStart) {
            conflict('overlapping target edits');
        }
        parts.push(target.slice(from, edit.from), edit.text);
        from = edit.to;
        lastEditStart = edit.from;
    }
    return parts.join('') + target.slice(from);
}

type DescriptionPath = (string | number)[];
type Document = ReturnType<typeof readDocument>;
type SourceDescriptionChange = {
    oldBody: Literal;
    newBody: Literal;
    sourcePath: DescriptionPath;
};

function collectSchemaDescriptions(node: unknown, path: DescriptionPath): DescriptionPath[] {
    if (!isMap(node)) {
        return [];
    }
    const description = node.get('description', true);
    const descriptions: DescriptionPath[] = literalScalar(description)
        ? [[...path, 'description']]
        : [];
    for (const {key, value} of node.items) {
        if (!isScalar(key) || typeof key.value !== 'string') {
            continue;
        }
        const field = key.value;
        if (field === 'properties' && isMap(value)) {
            for (const property of value.items) {
                if (isScalar(property.key) && typeof property.key.value === 'string') {
                    descriptions.push(
                        ...collectSchemaDescriptions(property.value, [
                            ...path,
                            field,
                            property.key.value,
                        ]),
                    );
                }
            }
        } else if (['items', 'additionalProperties', 'not'].includes(field)) {
            descriptions.push(...collectSchemaDescriptions(value, [...path, field]));
        } else if (['allOf', 'anyOf', 'oneOf'].includes(field) && isSeq(value)) {
            value.items.forEach((item, index) =>
                descriptions.push(...collectSchemaDescriptions(item, [...path, field, index])),
            );
        }
    }
    return descriptions;
}

function readSchemaDescriptionChanges(
    before: string,
    after: string,
    oldSource: Document,
    newSource: Document,
    fragment: PathItem,
): SourceDescriptionChange[] {
    const root = oldSource.contents;
    if (!isMap(root) || fragment.address.length !== 1) {
        return [];
    }
    const paths = root.items.flatMap(({key, value}) =>
        isScalar(key) && typeof key.value === 'string' && key.value !== fragment.address[0]
            ? collectSchemaDescriptions(value, [key.value])
            : [],
    );
    return paths.flatMap((sourcePath) => {
        const oldNode = literalScalar(oldSource.getIn(sourcePath, true));
        const newNode = literalScalar(newSource.getIn(sourcePath, true));
        if (!oldNode || !newNode || oldNode.value === newNode.value) {
            return [];
        }
        return [
            {
                sourcePath,
                oldBody: readLiteral(before, oldNode),
                newBody: readLiteral(after, newNode),
            },
        ];
    });
}

function followLocalDescriptionCopies(
    sourceDoc: Document,
    node: unknown,
    reference: string,
    attachment: DescriptionPath,
    activeReferences = new Set<string>(),
): DescriptionPath[] {
    if (isSeq(node)) {
        return node.items.flatMap((item, index) =>
            followLocalDescriptionCopies(
                sourceDoc,
                item,
                reference,
                [...attachment, index],
                activeReferences,
            ),
        );
    }
    if (!isMap(node)) {
        return [];
    }
    const ref = node.get('$ref');
    if (ref === reference) {
        return [attachment];
    }
    if (typeof ref === 'string') {
        const [, key] = ref.match(/^#\/([\w.-]+)$/) ?? [];
        if (!key || activeReferences.has(ref)) {
            return [];
        }
        return followLocalDescriptionCopies(
            sourceDoc,
            sourceDoc.get(key, true),
            reference,
            attachment,
            new Set([...activeReferences, ref]),
        );
    }
    return node.items.flatMap(({key, value}) =>
        isScalar(key) && typeof key.value === 'string'
            ? followLocalDescriptionCopies(
                  sourceDoc,
                  value,
                  reference,
                  [...attachment, key.value],
                  activeReferences,
              )
            : [],
    );
}

function schemaDescriptionAttachments(
    source: Document,
    target: Document,
    operation: Operation,
    fragment: PathItem,
    sourcePath: DescriptionPath,
): DescriptionPath[] {
    const [schema, ...relativePath] = sourcePath;
    if (typeof schema !== 'string' || !/^[\w.-]+$/.test(schema)) {
        return conflict('invalid local schema description address');
    }
    const reference = '#/' + schema;
    const attached = followLocalDescriptionCopies(
        source,
        source.getIn([...fragment.address, operation.method], true),
        reference,
        ['paths', fragment.route, operation.method],
    );
    const shared = documentOperations(source, fragment).some(
        (other) =>
            other.id !== operation.id &&
            followLocalDescriptionCopies(
                source,
                source.getIn([...fragment.address, other.method], true),
                reference,
                [],
            ).length > 0,
    );
    if (shared) {
        return conflict('changed schema description is shared by multiple operations');
    }
    if (!attached.length) {
        return conflict('changed schema description is detached from the operation');
    }
    const sourceRoot = source.contents;
    if (!isMap(sourceRoot)) {
        conflict('invalid operation fragment');
    }
    for (const {key, value} of sourceRoot.items) {
        if (!isScalar(key) || typeof key.value !== 'string' || key.value === fragment.address[0]) {
            continue;
        }
        const component = ['components', 'schemas', key.value];
        if (target.getIn(component, true) === undefined) {
            continue;
        }
        if (key.value === schema) {
            attached.push(component);
        } else {
            attached.push(...followLocalDescriptionCopies(source, value, reference, component));
        }
    }
    return attached.map((path) => [...path, ...relativePath]);
}

function readDescriptionAttachment(target: Document, path: DescriptionPath): unknown {
    const redirects = new Set<string>();
    let remaining = [...path];
    let node: unknown = target.contents;
    while (remaining.length) {
        if (!isMap(node) && !isSeq(node)) {
            return undefined;
        }
        const ref = isMap(node) && node.get('$ref');
        if (typeof ref === 'string') {
            if (redirects.has(ref) || !ref.startsWith('#/') || ref.includes('%')) {
                return conflict('unsupported localized schema reference');
            }
            redirects.add(ref);
            const pointer = ref
                .slice(2)
                .split('/')
                .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
            remaining = [...pointer, ...remaining];
            node = target.contents;
        } else {
            const key = remaining.shift()!;
            node = node.get(key, true);
        }
    }
    return node;
}

export type OpenApiDescriptionEdit = {
    operationId: string;
    method: string;
    route: string;
    markdown: string;
};

/** Read one localized root and plan byte-local changes for any number of source fragments. */
export function createOpenApiDescriptionProjection(target: string) {
    const targetDoc = readDocument(target);
    const byId = new Map<string, Operation[]>();
    for (const operation of documentOperations(targetDoc)) {
        const matches = byId.get(operation.id) ?? [];
        matches.push(operation);
        byId.set(operation.id, matches);
    }
    const planned = new WeakMap<OpenApiDescriptionEdit, (translated: string) => TextEdit[]>();
    let protect: ReturnType<typeof localGuideLinkProtection> | undefined;
    function protectGuideLink(url: string): boolean {
        if (!protect) {
            const descriptions: string[] = [];
            visit(targetDoc, {
                Pair(_key, pair) {
                    if (!isScalar(pair.key) || pair.key.value !== 'description') {
                        return;
                    }
                    const description = literalScalar(pair.value);
                    if (description) {
                        descriptions.push(description.value);
                    }
                },
            });
            protect = localGuideLinkProtection(descriptions);
        }
        return protect(url);
    }

    return {
        plan(
            before: string,
            after: string,
            currentSource: string,
            fragment: PathItem,
        ): OpenApiDescriptionEdit[] {
            const oldDoc = readDocument(before);
            const newDoc = readDocument(after);
            const currentDoc = readDocument(currentSource);
            const oldOperations = documentOperations(oldDoc, fragment);
            const newOperations = documentOperations(newDoc, fragment);
            const currentOperations = currentDoc && documentOperations(currentDoc, fragment);
            const changed = changedOperationDescriptions(oldOperations, newOperations);
            if (!changed.length) {
                conflict('expected a changed operation description');
            }

            const edits = changed.map(({operation, oldValue, newValue}) => {
                const {route} = fragment;
                const candidates = byId.get(operation.id);
                if (
                    oldOperations.filter((op) => op.id === operation.id).length !== 1 ||
                    newOperations.filter((op) => op.id === operation.id).length !== 1 ||
                    candidates?.length !== 1 ||
                    candidates[0].path !== route ||
                    candidates[0].method !== operation.method
                ) {
                    return conflict('operation route, method or id is missing or ambiguous');
                }
                if (currentOperations) {
                    const current = currentOperations.filter((op) => op.id === operation.id);
                    const value = literalScalar(current[0]?.description)?.value;
                    if (
                        current.length !== 1 ||
                        !sameOperation(operation, current[0]) ||
                        (value !== oldValue.value && value !== newValue.value)
                    ) {
                        return conflict(
                            'source operation description changed in the current source',
                        );
                    }
                }
                const oldBody = readLiteral(before, oldValue);
                const newBody = readLiteral(after, newValue);
                const localized = readLiteral(target, candidates[0].description);
                const movedUrls = new Set<string>();
                const guide = planGuideDelta(
                    oldBody,
                    newBody,
                    localized,
                    (url) => movedUrls.has(url) || protectGuideLink(url),
                );
                const projection = guide ?? planPlainDescription(oldBody, newBody, localized, true);
                return {
                    guide,
                    movedUrls,
                    operation,
                    route,
                    oldBody,
                    newBody,
                    projection,
                    additional: [] as TextEdit[],
                };
            });

            const schemaChanges = readSchemaDescriptionChanges(
                before,
                after,
                oldDoc,
                newDoc,
                fragment,
            );
            if (schemaChanges.length) {
                if (edits.length !== 1) {
                    conflict('cannot attribute a schema description change to one operation');
                }
                const [{operation, additional, guide, movedUrls}] = edits;
                if (!guide) {
                    return conflict('schema description changes require a guide link relocation');
                }
                const seen = new Set<number>();
                for (const {sourcePath, oldBody, newBody} of schemaChanges) {
                    const paths = schemaDescriptionAttachments(
                        oldDoc,
                        targetDoc,
                        operation,
                        fragment,
                        sourcePath,
                    );
                    if (currentDoc) {
                        const current = literalScalar(currentDoc.getIn(sourcePath, true))?.value;
                        if (current !== oldBody.value && current !== newBody.value) {
                            return conflict(
                                'source schema description changed in the current source',
                            );
                        }
                        const currentPaths = schemaDescriptionAttachments(
                            currentDoc,
                            targetDoc,
                            operation,
                            fragment,
                            sourcePath,
                        );
                        if (JSON.stringify(paths) !== JSON.stringify(currentPaths)) {
                            return conflict(
                                'source schema description attachments changed in the current source',
                            );
                        }
                    }
                    for (const path of paths) {
                        const localized = readLiteral(
                            target,
                            readDescriptionAttachment(targetDoc, path),
                        );
                        if (seen.has(localized.from)) {
                            continue;
                        }
                        const deletion = planLinkedParagraphDeletion(oldBody, newBody, localized);
                        if (!deletion || !guide.urls.includes(deletion.url)) {
                            return conflict('unsupported changed schema description');
                        }
                        if (deletion.protectedUrl) {
                            movedUrls.add(deletion.url);
                        }
                        seen.add(localized.from);
                        additional.push(deletion.edit);
                    }
                }
            }

            return edits.map(({operation, route, projection, additional}) => {
                const edit = {
                    operationId: operation.id,
                    method: operation.method,
                    route,
                    markdown: projection.markdown,
                };
                planned.set(edit, (translated) => [...projection.apply(translated), ...additional]);
                return edit;
            });
        },
        apply(edits: readonly {edit: OpenApiDescriptionEdit; translated: string}[]): string {
            const changes = edits.flatMap(({edit, translated}) => {
                const apply = planned.get(edit);
                if (!apply) {
                    return conflict('description edit was planned for a different target');
                }
                return apply(translated);
            });
            return applyTextEdits(target, changes);
        },
    };
}
