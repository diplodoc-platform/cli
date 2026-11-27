import {expect, test} from 'vitest';
import {parse, stringify} from 'yaml';

import {planOpenapi} from './index';

const root = 'greenhouse.yaml';
const version = 'openapi: 3.0.3\n';
const plan = (
    before: ReadonlyMap<string, string>,
    after: ReadonlyMap<string, string>,
    target: string,
    current = after,
) => planOpenapi(root, before, after, current, target, 'ru', 'en');

test('places a propagation advisory beside a uniquely identified paragraph in a referenced path item', () => {
    const registration = version + 'paths:\n  /cuttings:\n    $ref: prop.yaml#/tray\n';
    const item = [
        'tray:',
        '  get:',
        '    operationId: inspectCuttings',
        '    description: |',
        '      Туман включается по метке `mistCycle`.',
        '',
    ].join('\n');
    const advisory = 'Проверьте влажность мха.';
    const before = new Map([
        [root, registration],
        ['prop.yaml', item],
    ]);
    const after = new Map(before);
    const updated = item.replace('      Туман', `      ${advisory}\n\n      Туман`);
    after.set('prop.yaml', updated);
    const target = [
        '# East glasshouse',
        'openapi: 3.0.3',
        'paths:',
        '  /cuttings:',
        '    get:',
        '      operationId: inspectCuttings # checked by the grower',
        '      description: |',
        '        The :no-translate[`mistCycle`] marker starts the mist.',
        '',
    ].join('\r\n');

    const patch = plan(before, after, target);
    expect(patch.input.trim()).toBe(advisory);
    expect(patch.apply('Check the dampness of the moss.')).toBe(
        target.replace('        The', '        Check the dampness of the moss.\r\n\r\n        The'),
    );
    const stale = new Map(after);
    stale.set('prop.yaml', updated.replace(advisory, 'Уберите сухую кору.'));
    expect(() => plan(before, after, target, stale)).toThrow();
});

test('bundles a new irrigation valve route without translating the sample payload', () => {
    const target =
        version + 'paths:\n  /cistern:\n    get:\n      operationId: measureCistern # inspected\n';
    const before = new Map([[root, target]]);
    const after = new Map(before);
    after.set(root, target + '  /valves:\n    $ref: plumbing.yaml#/hardware/valve\n');
    const message = 'Открыть заслонку полива';
    const example = {description: 'Грядка с шалфеем', turns: 2};
    const valve = {
        operationId: 'openSeedlingValve',
        summary: message,
        requestBody: {content: {'application/json': {example}}},
    };
    after.set('plumbing.yaml', stringify({hardware: {valve: {post: valve}}}));
    const patch = plan(before, after, target);
    expect(patch.input.trim()).toBe(message);
    const output = patch.apply('Open the irrigation valve');
    expect(output.startsWith(target)).toBe(true);
    expect(parse(output).paths['/valves'].post).toEqual({
        ...valve,
        summary: 'Open the irrigation valve',
    });
});

test('projects a change in the supported plant seasons with zero translation units', () => {
    const source = [
        'openapi: 3.0.3',
        'paths:',
        '  /transplant:',
        '    post:',
        '      operationId: scheduleTransplant',
        '      summary: Перенос рассады в сад',
        '      x-growing-seasons:',
        '        - spring # frost has cleared',
        '        - autumn',
        '',
    ].join('\r\n');
    const target = source.replace('Перенос рассады в сад', 'Move seedlings outdoors');
    const addSummer = (body: string) =>
        body.replace('        - autumn', '        - summer\r\n        - autumn');
    const patch = plan(new Map([[root, source]]), new Map([[root, addSummer(source)]]), target);
    expect(patch.input).toBe('');
    expect(patch.apply('')).toBe(addSummer(target));
    expect(() => patch.apply('unexpected')).toThrow('structural change');
});

test('leaves a potting route intact when it migrates to a different file and pointer', () => {
    const oldRegistration = version + 'paths:\n  /potting:\n    $ref: services.yaml#/potting\n';
    const oldItem = {get: {operationId: 'readPottingBench'}};
    const target = stringify({openapi: '3.0.3', paths: {'/potting': oldItem}});
    const before = new Map([
        [root, oldRegistration],
        ['services.yaml', stringify({potting: oldItem})],
    ]);
    const after = new Map([
        [root, oldRegistration.replace('services.yaml#/potting', 'benches.yaml#/station')],
        ['benches.yaml', stringify({station: oldItem})],
    ]);
    const patch = plan(before, after, target);
    expect(patch.input).toBe('');
    expect(patch.apply('')).toBe(target);
});

test('retains an existing note while a companion route and the note heading change', () => {
    const registration = version + 'paths:\n  /orchids:\n    $ref: tropical.yaml#/orchidCare\n';
    const originalNote = 'Корзины из лозы';
    const updatedNote = 'Опоры корней';
    const firstLine = 'Комната выходит на север.';
    const noteBody = 'Закрепите опору под нижним листом.';
    const care = [
        'orchidCare:',
        '  get:',
        '    operationId: readOrchidCare',
        '    description: |',
        '      ' + firstLine,
        '',
        `      {% note info "${originalNote}" %}`,
        '',
        '      ' + noteBody,
        '',
        '      {% endnote %}',
        '',
    ].join('\n');
    const before = new Map([
        [root, registration],
        ['tropical.yaml', care],
    ]);
    const after = new Map(before);
    after.set(root, registration + '  /trellis:\n    $ref: supports.yaml#/install\n');
    const stagedCare = care.replace(originalNote, updatedNote);
    after.set('tropical.yaml', stagedCare);
    after.set(
        'supports.yaml',
        'install:\n  put:\n    operationId: mountTrellis\n    summary: Установка решётки\n',
    );
    const current = new Map(after);
    const newerIntro = 'Окно выходит во двор.';
    current.set('tropical.yaml', stagedCare.replace(firstLine, newerIntro));
    const target = [
        'openapi: 3.0.3',
        'paths:',
        '  /orchids:',
        '    get:',
        '      operationId: readOrchidCare',
        '      description: |',
        '        This glasshouse faces north.  ',
        '',
        `        {% note info "${originalNote}" %}`,
        '',
        '        Secure the support beneath the lowest leaf.',
        '',
        '        {% endnote %}',
        '',
    ].join('\n');

    const patch = plan(before, after, target, current);
    expect(patch.input).not.toContain(newerIntro);
    expect(patch.input).not.toContain(noteBody);
    const localized = patch.input
        .replace(updatedNote, 'Root supports')
        .replace('Установка решётки', 'Install a trellis');
    const output = patch.apply(localized);
    expect(output.startsWith(target.replace(originalNote, 'Root supports'))).toBe(true);
    expect(parse(output).paths['/trellis'].put.summary).toBe('Install a trellis');
    expect(() => patch.apply(localized.replace(/^.*\n/, ''))).toThrow('Incomplete');

    const drift = new Map(current);
    drift.set(
        'tropical.yaml',
        current.get('tropical.yaml')!.replace(noteBody, 'Привяжите цветонос.'),
    );
    expect(() => plan(before, after, target, drift)).toThrow('changed the selected note');
});

const mediaType = 'application/json';
const plotFile = 'seedbeds.yaml';
const plotRegistration = version + 'paths:\n  /plots:\n    $ref: seedbeds.yaml#/plotRegistry\n';
const plotRequest = [
    'plotRegistry:',
    '  patch:',
    '    operationId: revisePlantingPlot',
    '    requestBody:',
    '      content:',
    '        application/json:',
    '          schema:',
    '            $ref: "#/PlantingPlot"',
    'PlantingPlot:',
    '  type: object',
    '  properties:',
    '    sowingDepth:',
    '      type: number',
    '',
].join('\n');
const plotTarget = {
    openapi: '3.0.3',
    paths: {
        '/plots': {
            patch: {
                operationId: 'revisePlantingPlot',
                requestBody: {
                    content: {
                        [mediaType]: {
                            schema: {type: 'object', properties: {sowingDepth: {type: 'number'}}},
                        },
                    },
                },
            },
        },
    },
};

test('adds a scalar plot setting directly to the localized request schema', () => {
    const before = new Map([
        [root, plotRegistration],
        [plotFile, plotRequest],
    ]);
    const field = '    shadeCloth:\n      type: boolean\n';
    const after = new Map([
        [root, plotRegistration],
        [plotFile, plotRequest + field],
    ]);
    const target = stringify(plotTarget);
    const patch = plan(before, after, target);
    expect(patch.input).toBe('');
    expect(patch.apply('')).toBe(
        target + '                shadeCloth:\n                  type: boolean\n',
    );
});

test('preserves a reviewed plan when all source snapshots agree and requires the live root', () => {
    const source = version + 'paths: {}\n';
    const target = '# Winter planting plan\n' + source;
    const snapshot = new Map([[root, source]]);
    const patch = plan(snapshot, snapshot, target);
    expect(patch.input).toBe('');
    expect(patch.apply('')).toBe(target);
    expect(() => plan(snapshot, snapshot, target, new Map())).toThrow('Missing OpenAPI root');
});

test('updates an inline potting advisory and guards an external path item’s binding', () => {
    const operation = [
        '    get:',
        '      operationId: checkDrainage',
        '      description: |',
        '        Снимите показание `drainTray`.',
        '',
    ].join('\n');
    const advise = (text: string) =>
        text.replace('Снимите', 'Откройте пробку поддона.\n\n        Снимите');
    const inline = version + 'paths:\n  /drainage:\n' + operation;
    const target = inline.replace(
        'Снимите показание `drainTray`.',
        'Read the :no-translate[`drainTray`] sensor.',
    );
    const before = new Map([[root, inline]]);
    const after = new Map([[root, advise(inline)]]);
    expect(plan(before, after, target).apply('Open the tray plug.')).toBe(
        target.replace('        Read', '        Open the tray plug.\n\n        Read'),
    );

    const dependency = 'drain.yaml';
    const registration = version + 'paths:\n  /drainage:\n    $ref: drain.yaml#/readout\n';
    const externalize = (body: string) => 'readout:\n' + body.replace(/^ {2}/gm, '');
    const oldSplit = new Map([
        [root, registration],
        [dependency, externalize(operation)],
    ]);
    const changedSplit = new Map([
        [root, registration],
        [dependency, externalize(advise(operation))],
    ]);
    const live = new Map(changedSplit);
    live.set(root, registration.replace('#/readout', '#/deprecated'));
    expect(() => plan(oldSplit, changedSplit, target, live)).toThrow('path item binding');
    live.set(root, registration);
    live.delete(dependency);
    expect(() => plan(oldSplit, changedSplit, target, live)).toThrow('path item binding');
});

test('adds an array setting with a reusable localized cultivar definition', () => {
    const componentFile = 'cultivars.yaml';
    const sourceLabel = 'Сорт, выведенный для затенённых грядок.';
    const before = new Map([
        [root, plotRegistration],
        [plotFile, plotRequest],
        [componentFile, stringify({CultivarName: {type: 'string', description: sourceLabel}})],
    ]);
    const advice = 'Сорта для соседних рядов.';
    const after = new Map(before);
    after.set(
        plotFile,
        plotRequest +
            [
                '    companionCultivars:',
                '      description: ' + advice,
                '      type: array',
                '      items:',
                '        $ref: cultivars.yaml#/CultivarName',
                '',
            ].join('\n'),
    );
    const target = stringify({
        ...plotTarget,
        components: {
            schemas: {
                CultivarName: {type: 'string', description: 'A cultivar bred for shaded beds.'},
            },
        },
    });
    const patch = plan(before, after, target);
    expect(patch.input).toBe(advice);
    const output = parse(patch.apply('Cultivars for neighboring rows.'));
    expect(
        output.paths['/plots'].patch.requestBody.content[mediaType].schema.properties
            .companionCultivars,
    ).toMatchObject({
        description: 'Cultivars for neighboring rows.\n',
        items: {$ref: '#/components/schemas/CultivarName'},
    });

    const current = new Map(after);
    current.delete(componentFile);
    expect(() => plan(before, after, target, current)).toThrow('Missing referenced schema');
    current.set(componentFile, after.get(componentFile)!);
    current.set(root, plotRegistration.replace('#/plotRegistry', '#/archivedPlots'));
    expect(() => plan(before, after, target, current)).toThrow('request schema binding');
});
