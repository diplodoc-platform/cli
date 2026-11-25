import {expect, test} from 'vitest';
import {parse} from 'yaml';

import {changedNoteTitle, planAddedRoute} from './route-and-note';

const root = 'service.yaml';
const inventory = 'inventory.yaml';
const history = 'history.yaml';
const note = '      {% note info "Архив" %}';

function scenario() {
    const header = 'openapi: 3.0.3\ninfo: {title: Warehouse}\npaths:\n';
    const existing = '  /inventory:\n    $ref: inventory.yaml#/listing\n';
    const health =
        '  /status:\n    get:\n      operationId: status\n      responses:\n        "200": {description: Запрос принят.}\n';
    const addition = '  /history:\n    $ref: history.yaml#/history\n';
    const beforeNote = [
        'listing:',
        '  get:',
        '    operationId: listing',
        '    description: |',
        '      Список товаров.',
        '',
        '      {% note info "Каталог" %}',
        '',
        '      Просмотр записей.',
        '',
        '      {% endnote %}',
        '',
    ].join('\n');
    const newRoute = [
        'history:',
        '  get:',
        '    operationId: history',
        '    tags: [warehouse]',
        '    summary: История.',
        '    responses:',
        '      "200": {description: Запрос принят.}',
        '',
    ].join('\n');
    const previous = new Map([
        [root, header + existing + health],
        [inventory, beforeNote],
    ]);
    const graph = new Map([
        [root, header + existing + addition + health],
        [inventory, beforeNote.replace('Каталог', 'Архив')],
        [history, newRoute],
    ]);
    const target = [
        'openapi: 3.0.3',
        'info: {title: Warehouse}',
        'paths:',
        '  /inventory:',
        '    get:',
        '      operationId: listing',
        '      description: |',
        '        Reviewed inventory.',
        '',
        '        {% note info "Каталог" %}',
        '',
        '        Browse entries.',
        '',
        '        {% endnote %}',
        '  /status:',
        '    get:',
        '      operationId: status',
        '      responses:',
        '        "200": {description: Accepted.}',
        '',
    ].join('\n');
    const live = new Map(previous);
    const plan = (localized = target) =>
        planAddedRoute(
            root,
            previous,
            graph,
            live,
            {file: inventory, header: note},
            localized,
            'ru',
            'en',
        );
    return {header, existing, health, addition, previous, graph, live, plan, target};
}

function setFile(graph: Map<string, string>, file: string, from: string, to: string) {
    const value = graph.get(file)!;
    expect(value).toContain(from);
    graph.set(file, value.replace(from, to));
}

test('only a title change within a single identical note opening qualifies', () => {
    const before = '  {% note info "Catalogue" %}\r\n\r\n  Body.\r\n  {% endnote %}';
    const after = before.replace('Catalogue', 'Archive');
    expect(changedNoteTitle(before, after)).toBe('  {% note info "Archive" %}');
    expect(changedNoteTitle(before, before)).toBeUndefined();
    expect(changedNoteTitle(before, after + '\n')).toBeUndefined();
    expect(changedNoteTitle(before, after.replace('Body.', 'Other body.'))).toBeUndefined();
    expect(changedNoteTitle(before, after.replace('note info', 'note warning'))).toBeUndefined();
    expect(changedNoteTitle(before, after.replace('  {% note', '     {% note'))).toBeUndefined();
    expect(changedNoteTitle('Before', 'After')).toBeUndefined();
    expect(changedNoteTitle(before, after.replace(' "Archive"', ''))).toBeUndefined();
});

test('reuses approved responses, inserts before the next existing route and preserves the note body', () => {
    const {plan, target} = scenario();
    const result = plan()!;
    expect(result.fragments).toEqual(['Архив', 'История.']);
    const patched = result.apply(['Archive', 'History.']);
    const expected = target
        .replace('Каталог', 'Archive')
        .replace(
            '  /status:',
            '  /history:\n    get:\n      operationId: history\n      tags:\n        - warehouse\n      summary: History.\n      responses:\n        "200":\n          description: Accepted.\n  /status:',
        );
    expect(parse(patched)).toEqual(parse(expected));
    expect(patched.slice(0, patched.indexOf('  /history:'))).toBe(
        target
            .replace('Каталог', 'Archive')
            .slice(0, target.replace('Каталог', 'Archive').indexOf('  /status:')),
    );
    expect(() => result.apply(['Архив', 'History.'])).toThrow('Untranslated prose');
    expect(() => result.apply(['Archive'])).toThrow('Missing translated segment');
    expect(() => result.apply(['Archive "quoted"', 'History.'])).toThrow(
        'Target note is ambiguous',
    );
});

test('appends a route after localized paths when there is no following anchor', () => {
    const {graph, header, existing, health, addition, plan} = scenario();
    graph.set(root, header + existing + health + addition);
    const result = plan()!;
    expect(Object.keys(parse(result.apply(['Archive', 'History.'])).paths)).toEqual([
        '/inventory',
        '/status',
        '/history',
    ]);
});

test.each([
    [
        'non-path metadata',
        (graph: Map<string, string>) => setFile(graph, root, 'Warehouse', 'Different API'),
    ],
    [
        'existing registration',
        (graph: Map<string, string>) => setFile(graph, root, '#/listing', '#/other'),
    ],
    [
        'multiple new registrations',
        (graph: Map<string, string>) => graph.set(root, graph.get(root)! + '  /empty: {}\n'),
    ],
    [
        'multiple methods',
        (graph: Map<string, string>) =>
            graph.set(history, graph.get(history)! + '  post: {operationId: duplicate}\n'),
    ],
])('leaves unsupported route-planning shapes to the general planner: %s', (_name, change) => {
    const {graph, plan} = scenario();
    change(graph);
    expect(plan()).toBeUndefined();
});

test('rejects target collisions before preparing fragments', () => {
    const {plan, target} = scenario();
    expect(() => plan(target + '  /history:\n    get: {operationId: previous}\n')).toThrow(
        'already contains',
    );
    expect(() => plan(target.replace('operationId: status', 'operationId: history'))).toThrow(
        'duplicate operationId',
    );
    expect(() => plan(target.replace('Каталог', 'Another title'))).toThrow('target note');
});

test('rejects a changed operation contract, verb, title contents or second source line', () => {
    for (const [from, to, reason] of [
        ['operationId: listing', 'operationId: moved', /operation contract/],
        ['  get:', '  post:', /operation also changed/],
        ['note info', 'note tip', /not a note title/],
        ['Список товаров.', 'Другое описание.', /one note title/],
    ] as const) {
        const {graph, plan} = scenario();
        setFile(graph, inventory, from, to);
        expect(() => plan()).toThrow(reason);
    }
    const {graph, previous, plan} = scenario();
    graph.set(inventory, previous.get(inventory)!);
    expect(() => plan()).toThrow('Could not align the changed note title');
});

test('rejects later modifications of the note, route registration and current dependencies', () => {
    const changedBody = scenario();
    changedBody.live.set(
        inventory,
        changedBody.graph.get(inventory)!.replace('Просмотр записей.', 'Новый текст.'),
    );
    expect(() => changedBody.plan()).toThrow('Current source changed the selected note');

    const missing = scenario();
    missing.live.delete(root);
    expect(() => missing.plan()).toThrow('Missing current OpenAPI root');

    const registration = scenario();
    registration.live.set(
        root,
        registration.graph.get(root)!.replace('history.yaml', 'other.yaml'),
    );
    expect(() => registration.plan()).toThrow('new path registration');

    const noteRegistration = scenario();
    setFile(noteRegistration.live, root, 'inventory.yaml#/listing', 'inventory.yaml#/other');
    expect(() => noteRegistration.plan()).toThrow('note path registration');

    const dependency = scenario();
    dependency.live.set(root, dependency.graph.get(root)!);
    dependency.live.set(history, dependency.graph.get(history)!.replace('История.', 'Изменение.'));
    expect(() => dependency.plan()).toThrow('operation or its dependencies');
});

test('a structurally matching but differently aligned response goes to translation', () => {
    const {plan, target} = scenario();
    const update = plan(target.replace('Accepted.', 'Запрос принят.'))!;
    expect(update.fragments).toEqual(['Архив', 'История.', 'Запрос принят.']);
    expect(
        parse(update.apply(['Archive', 'History.', 'Approved.'])).paths['/history'].get.responses[
            '200'
        ].description,
    ).toBe('Approved.');
});
