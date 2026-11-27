import {expect, test} from 'vitest';
import {parse, parseDocument} from 'yaml';

import {
    createOpenApiDescriptionProjection,
    indexPathItems,
    isDescriptionChange,
    planOpenApiDescription,
} from './description';
import {localGuideLinkProtection, planGuideDelta, planLinkedParagraphDeletion} from './guide';
import {readLiteral} from './literal';

const route = '/catalog';
const fragment = {route, address: ['catalog']};
const first = 'Введите `prefix`.';
const last = 'Проверьте `suffix`.';
const localizedFirst = 'Use a reviewed `prefix`.';
const localizedLast = 'Check the `suffix` when ready.';

function indent(text: string, depth: number) {
    return text
        .split('\n')
        .map((line) => line && ' '.repeat(depth) + line)
        .join('\n');
}

function body(text: string) {
    return 'description: |\n' + indent(text, 2) + '\n';
}

function literal(text: string) {
    const yaml = body(text);
    return readLiteral(yaml, parseDocument(yaml).get('description', true));
}

function operation(description: string, id = 'getCatalog') {
    return 'get:\n  operationId: ' + id + '\n' + indent(body(description), 2);
}

function api(description: string) {
    return 'openapi: 3.0.3\npaths:\n  /catalog:\n' + indent(operation(description), 4);
}

function attachment(description: string) {
    return 'catalog:\n' + indent(operation(description), 2);
}

const before = first + '\n\n' + last;
const added = 'Укажите `separator`.';
const translated = 'Set the `separator`.';
const after = first + '\n\n' + added + '\n\n' + last;
const target = localizedFirst + '\n\n' + localizedLast;

test('identifies a unique local path item, normalizing file and pointer escapes', () => {
    const openapi = [
        'openapi: 3.0.3',
        'paths:',
        '  /catalog: {$ref: "./dir/../ref%20file.yaml#/entries~1a/child~0b"}',
        '  /duplicated: {$ref: "./paths.yaml#/duplicated"}',
        '  /other: {$ref: "paths.yaml#/other"}',
        '  /bad: {$ref: "both.yaml#/one#two"}',
        '  /mixed: {$ref: "mixed.yaml", description: invalid}',
        '  /external: {$ref: "https://example.test/api.yaml"}',
        '  /absolute: {$ref: "/test/api.yaml"}',
        '  /query: {$ref: "test.yaml?param=value"}',
        '  /notRef: {get: {operationId: list}}',
        '  /notMap: false',
        '',
    ].join('\n');
    expect(indexPathItems(openapi)).toEqual(
        new Map([
            ['ref file.yaml', {route, address: ['entries/a', 'child~b']}],
            ['paths.yaml', undefined],
            ['both.yaml', undefined],
            ['mixed.yaml', undefined],
        ]),
    );
    expect(() => indexPathItems(openapi.replace('3.0.3', '3.1.0'))).toThrow('unsupported OpenAPI');
    expect(() => indexPathItems('[')).toThrow('invalid YAML');
});

test('checks that only a description body changed and splices it into the localized root', () => {
    expect(isDescriptionChange(api(before), api(after))).toBe(true);
    expect(isDescriptionChange(api(before), api(before))).toBe(false);
    expect(isDescriptionChange(api(before), api(after) + 'tags: []\n')).toBe(false);
    expect(isDescriptionChange(attachment(before), attachment(after), fragment)).toBe(true);
    const update = planOpenApiDescription(api(before), api(after), api(target), api(after));
    expect(update.markdown).toBe(added);
    expect(update.apply(translated)).toBe(
        api(localizedFirst + '\n\n' + translated + '\n\n' + localizedLast),
    );
    expect(() => update.apply('Translated without a code span.')).toThrow('protected text');
    expect(() => update.apply('Set\r the `separator`.')).toThrow('invalid translation line ending');
    expect(() => update.apply(localizedFirst)).toThrow('paragraph structure');
});

test('appends, prepends and replaces paragraphs by a unique unchanged frame', () => {
    for (const [old, changed, destination, input, output] of [
        [
            first,
            first + '\n\n' + added,
            localizedFirst,
            translated,
            localizedFirst + '\n\n' + translated,
        ],
        [
            last,
            added + '\n\n' + last,
            localizedLast,
            translated,
            translated + '\n\n' + localizedLast,
        ],
        [
            first,
            'Замените `prefix`.',
            localizedFirst,
            'Replace the `prefix`.',
            'Replace the `prefix`.',
        ],
    ]) {
        expect(planOpenApiDescription(api(old), api(changed), api(destination)).apply(input)).toBe(
            api(output),
        );
    }
    const old = 'Описание.';
    expect(() =>
        planOpenApiDescription(api(old), api(added + '\n\n' + old), api('Reviewed.')),
    ).toThrow('no unique target anchor');
    expect(() => planOpenApiDescription(api(before), api(last), api(target))).toThrow(
        'new prose paragraphs',
    );
    expect(() => planOpenApiDescription(api(before), api(after), api(localizedLast))).toThrow(
        'target layout',
    );
});

test('source and target operations must still have unique matching routes, methods and ids', () => {
    expect(() => planOpenApiDescription(api(before), api(before), api(target))).toThrow(
        'one changed operation',
    );
    expect(() =>
        planOpenApiDescription(api(before), api(after) + 'tags: []\n', api(target)),
    ).toThrow('outside the description body');
    expect(() =>
        planOpenApiDescription(api(before), api(after), api(target), api('Другая версия.')),
    ).toThrow('changed in the current source');
    expect(() =>
        planOpenApiDescription(api(before), api(after), api(target).replace('/catalog', '/other')),
    ).toThrow('missing or ambiguous');
    const duplicate = '  /other:\n' + indent(operation('Другой путь.'), 4);
    expect(() =>
        planOpenApiDescription(api(before) + duplicate, api(after) + duplicate, api(target)),
    ).toThrow('source operationId is ambiguous');
    expect(() =>
        isDescriptionChange(api(before).replace('get:', 'get: false\n  ignored:'), api(after)),
    ).toThrow(/invalid operation mapping|invalid YAML/);
    expect(() =>
        planOpenApiDescription(api(before), api(after), api(target).replace('getCatalog', '2')),
    ).toThrow('invalid operationId');
});

test('patches one middle item of a flat list and keeps all adjacent target bytes', () => {
    const start = '- ' + first;
    const end = '- ' + last;
    const sourceList = [start, '- Прежний `item`.', end].join('\n');
    const newList = [start, '- Новый `item`.', end].join('\n');
    const targetList = ['- ' + localizedFirst, '- Reviewed `item`.  ', '- ' + localizedLast].join(
        '\n',
    );
    const update = planOpenApiDescription(api(sourceList), api(newList), api(targetList));
    expect(update.markdown).toBe('Новый `item`.');
    expect(update.apply('New `item`.')).toBe(api(targetList.replace('Reviewed', 'New')));
    expect(() => update.apply('New\n`item`.')).toThrow('multiple lines');
    expect(() =>
        planOpenApiDescription(
            api(sourceList),
            api(newList.replace(start, '- Changed first.')),
            api(targetList),
        ),
    ).toThrow('one changed item');
    expect(() =>
        planOpenApiDescription(
            api(sourceList),
            api(newList),
            api(targetList.replace('- ' + localizedLast, '- End.')),
        ),
    ).toThrow('list item layout');
    expect(() =>
        planOpenApiDescription(
            api(sourceList),
            api(newList.replace('Новый `item`.', 'Новый `item`. ')),
            api(targetList),
        ),
    ).toThrow('trailing whitespace');
});

test('plans independent source fragments and rejects edits belonging to another localized file', () => {
    const projection = createOpenApiDescriptionProjection(api(target));
    const [edit] = projection.plan(
        attachment(before),
        attachment(after),
        attachment(before),
        fragment,
    );
    expect(edit).toEqual({operationId: 'getCatalog', method: 'get', route, markdown: added});
    expect(projection.apply([{edit, translated}])).toBe(
        api(localizedFirst + '\n\n' + translated + '\n\n' + localizedLast),
    );
    expect(() => projection.apply([{edit: {...edit}, translated}])).toThrow(
        'planned for a different target',
    );
    expect(() =>
        projection.apply([
            {edit, translated},
            {edit, translated},
        ]),
    ).toThrow('overlapping target edits');
    expect(() =>
        projection.plan(attachment(before), attachment(before), attachment(before), fragment),
    ).toThrow('expected a changed operation');
    expect(() =>
        projection.plan(
            attachment(before),
            attachment(after),
            attachment('Другая версия.'),
            fragment,
        ),
    ).toThrow('changed in the current source');
    expect(() =>
        projection.plan(attachment(before), attachment(after), attachment(after), {
            ...fragment,
            route: '/other',
        }),
    ).toThrow('route, method or id');
});

const title = '**Материалы**';
const href = '../manual.md';
const guide = title + '\n\n- [Руководство](' + href + ')';
const renderedGuide = '**Resources**\n\n- [Manual](' + href + ')';
const include = '{% include [reference](reference.md) %}';

test('uses exact URL style first, then only consistent relative Markdown style', () => {
    const protect = localGuideLinkProtection([
        '[A](:no-translate[../reference.md])',
        '[External](https://example.test/about)',
        '{% include [Hidden](../hidden.md) %}',
    ]);
    expect(protect('../another.md#item')).toBe(true);
    expect(protect('../reference.md')).toBe(true);
    expect(protect('https://example.test/about')).toBe(false);
    expect(protect('page.html')).toBe(false);
    const mixed = localGuideLinkProtection([
        '[A](:no-translate[../reference.md])',
        '[B](../reference.md)',
        '[C](../other.md)',
    ]);
    expect(mixed('../reference.md')).toBe(false);
    expect(mixed('../other.md')).toBe(false);
    expect(mixed('../elsewhere.md')).toBe(false);
});

test('appends a guide with target-style link protection and validates every link and marker', () => {
    const plan = planGuideDelta(
        literal(before),
        literal(before + '\n\n' + guide),
        literal(target),
        () => true,
    )!;
    expect(plan.markdown).toBe(guide);
    expect(plan.urls).toEqual([href]);
    expect(plan.apply(renderedGuide)).toEqual([
        expect.objectContaining({
            text: '\n\n  **Resources**\n\n  - [Manual](:no-translate[../manual.md])',
        }),
    ]);
    expect(
        plan.apply(renderedGuide.replace(href, ':no-translate[' + href + ']'))[0].text,
    ).toContain('[Manual](:no-translate[../manual.md])');
    expect(() => plan.apply(renderedGuide.replace(href, '../other.md'))).toThrow(
        'link destinations',
    );
    expect(() => plan.apply(renderedGuide.replace('- [', '* ['))).toThrow('formatting');
    expect(() => plan.apply(renderedGuide.replace('**Resources**', 'Resources'))).toThrow(
        'formatting',
    );
});

test('inserts before a unique opaque directive and rejects ambiguous local boundaries', () => {
    const old = first + '\n\n' + include;
    const next = first + '\n\n' + guide + '\n\n' + include;
    const localized = localizedFirst + '\n\n' + include;
    const plan = planGuideDelta(literal(old), literal(next), literal(localized), () => false)!;
    const [edit] = plan.apply(renderedGuide);
    expect(body(localized).slice(edit.from, edit.from + include.length + 2)).toBe('  ' + include);
    expect(edit.text).toBe('  **Resources**\n\n  - [Manual](../manual.md)\n\n');
    expect(() =>
        planGuideDelta(literal(old), literal(next), literal(localizedFirst), () => false),
    ).toThrow('unique guide insertion boundary');
    expect(() =>
        planGuideDelta(
            literal(old),
            literal(next),
            literal(localized + '\n\n' + include),
            () => false,
        ),
    ).toThrow('unique guide insertion boundary');
    expect(
        planGuideDelta(
            literal(before),
            literal(after + '\n\n' + guide.replace('**', '')),
            literal(target),
            () => false,
        ),
    ).toBeUndefined();
    expect(
        planGuideDelta(
            literal(before),
            literal(first + '\n\n' + guide + '\n\n' + last),
            literal(target),
            () => false,
        ),
    ).toBeUndefined();
    expect(() =>
        planGuideDelta(
            literal(before),
            literal(before + '\n\n' + guide),
            literal(target + '\n\n' + renderedGuide),
            () => false,
        ),
    ).toThrow('already contains');
    expect(() =>
        planGuideDelta(
            literal(before),
            literal(before + '\n\n' + guide),
            literal('Unrelated.'),
            () => false,
        ),
    ).toThrow('insertion tail');
});

test('relocates a linked sentence using the localized link style', () => {
    const linked = first + ' Откройте [руководство](' + href + ').';
    const localizedLink = localizedFirst + ' Review the [manual](:no-translate[' + href + ']).';
    const old = linked + '\n\n' + last;
    const next = first + '\n\n' + last + '\n\n' + guide;
    const localized = localizedLink + '\n\n' + localizedLast;
    const plan = planGuideDelta(literal(old), literal(next), literal(localized), () => false)!;
    const edits = plan.apply(renderedGuide);
    expect(edits).toHaveLength(2);
    expect(body(localized).slice(edits[0].from, edits[0].to)).toBe(
        ' Review the [manual](:no-translate[../manual.md]).',
    );
    expect(edits[1].text).toContain(':no-translate[../manual.md]');
});

test('deletes one linked paragraph and fails when its localized counterpart is ambiguous', () => {
    const linked = 'Откройте [руководство](' + href + ').';
    const approved = 'Read the [manual](' + href + ').';
    const old = literal(linked + '\n\n' + last);
    const now = literal(last);
    const targetText = approved + '\n\n' + localizedLast;
    const removed = planLinkedParagraphDeletion(old, now, literal(targetText))!;
    expect(removed.url).toBe(href);
    expect(body(targetText).slice(removed.edit.from, removed.edit.to)).toBe(
        '  ' + approved + '\n\n',
    );
    expect(planLinkedParagraphDeletion(old, old, literal(targetText))).toBeUndefined();
    expect(
        planLinkedParagraphDeletion(literal('No link.\n\n' + last), now, literal(targetText)),
    ).toBeUndefined();
    expect(() =>
        planLinkedParagraphDeletion(old, now, literal(approved + '\n\n' + targetText)),
    ).toThrow('no unique localized paragraph');
    expect(() =>
        planLinkedParagraphDeletion(old, now, literal('Keep this. ' + targetText)),
    ).toThrow('contains additional content');
});

test('moves a schema link into its operation once even when the localized component is referenced twice', () => {
    const oldSchema = 'Данные товара.\n\nОткройте [руководство](' + href + ').';
    const newSchema = 'Данные товара.';
    const approved = 'Reviewed product.\n\nRead the [manual](:no-translate[' + href + ']).';
    const sourceResp =
        'responses:\n  "200":\n    content:\n      application/json:\n        schema: {$ref: "#/Product"}\n';
    const targetResp = sourceResp.replace('#/Product', '#/components/schemas/Product');
    function withSourceSchema(description: string, schemaText: string) {
        return (
            'catalog:\n' +
            indent(operation(description), 2) +
            indent(sourceResp, 4) +
            'Product:\n  type: string\n' +
            indent(body(schemaText), 2)
        );
    }
    const sourceBefore = withSourceSchema(before, oldSchema);
    const sourceAfter = withSourceSchema(before + '\n\n' + guide, newSchema);
    const localized =
        api(target) +
        indent(targetResp, 6) +
        'components:\n  schemas:\n    Product:\n      type: string\n' +
        indent(body(approved), 6);
    expect(isDescriptionChange(sourceBefore, sourceAfter, fragment)).toBe(true);
    const projection = createOpenApiDescriptionProjection(localized);
    const [edit] = projection.plan(sourceBefore, sourceAfter, sourceAfter, fragment);
    const output = parse(projection.apply([{edit, translated: renderedGuide}]));
    expect(output.components.schemas.Product.description).toBe('Reviewed product.\n');
    expect(output.paths[route].get.description).toContain('Manual](:no-translate[../manual.md])');
    expect(() =>
        projection.plan(
            sourceBefore,
            sourceAfter,
            sourceAfter.replace('Данные товара.', 'Иные данные.'),
            fragment,
        ),
    ).toThrow('schema description changed in the current source');
});
