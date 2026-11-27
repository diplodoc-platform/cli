import {expect, test} from 'vitest';
import {parse, stringify} from 'yaml';

import {planOpenApiContract} from './contract';

const root = 'observatory/spec.yaml';
const sourceFile = 'observatory/catalog.yaml';
const paths = {
    frames: '/sky/frames',
    telescopes: '/optics/telescopes',
    auroras: '/reports/auroras',
};

const observatory = {
    frames: {
        get: {
            operationId: 'listSkyFrames',
            summary: 'Consulta el archivo de negativos celestes.',
            'x-camera-bands': ['optical', 'radio'],
            responses: {},
        },
    },
    telescopes: {get: {operationId: 'listTelescopes', responses: {}}},
};

const approved = [
    'openapi: 3.0.3',
    'paths:',
    '  /sky/frames:',
    '    get:',
    '      operationId: listSkyFrames',
    '      summary: Survey the archive of sky images.  # archive curator',
    '      x-camera-bands:',
    '        - optical # historic installation',
    '        - radio',
    '      responses: {}',
    '  /optics/telescopes:',
    '    get:',
    '      operationId: listTelescopes',
    '      responses: {}',
    '',
].join('\r\n');

function catalog(
    contents: Record<string, unknown>,
    entries: (keyof typeof paths)[] = ['frames', 'telescopes'],
) {
    const registration = Object.fromEntries(
        entries.map((entry) => [paths[entry], {$ref: `catalog.yaml#/${entry}`}]),
    );
    return new Map([
        [root, stringify({openapi: '3.0.3', paths: registration})],
        [sourceFile, stringify(contents)],
    ]);
}

function frames(extra: Record<string, unknown>) {
    return {get: {...observatory.frames.get, ...extra}};
}

function auroraReport(description: string) {
    return catalog(
        {
            ...observatory,
            auroras: {get: {operationId: 'findAuroras', description, responses: {}}},
        },
        ['frames', 'telescopes', 'auroras'],
    );
}

test('inserts an instrumentation band without changing the curator’s wording or line endings', () => {
    const before = catalog(observatory);
    const after = catalog({
        ...observatory,
        frames: frames({'x-camera-bands': ['optical', 'infrared:near', 'radio']}),
    });
    const patch = planOpenApiContract(root, before, after, before, approved)!;
    expect(patch.fragments).toEqual([]);
    expect(patch.apply([])).toBe(
        approved.replace('        - radio', '        - infrared:near\r\n        - radio'),
    );
});

test('accepts relocation of a path item and rejects incompatible current or localized versions', () => {
    const before = catalog(observatory);
    const moved = new Map(before);
    moved.set(root, before.get(root)!.replace('catalog.yaml#/frames', 'camera.yaml#/archive'));
    moved.set('observatory/camera.yaml', stringify({archive: observatory.frames}));
    expect(planOpenApiContract(root, before, moved, before, approved)).toBeUndefined();

    const narrower = catalog({
        ...observatory,
        frames: frames({'x-camera-bands': ['radio']}),
    });
    const changedHardware = catalog({
        ...observatory,
        frames: frames({'x-camera-bands': ['ultraviolet']}),
    });
    expect(() =>
        planOpenApiContract(
            root,
            before,
            narrower,
            before,
            approved.replace('listSkyFrames', 'getFilm'),
        ),
    ).toThrow('target operation identity');
    expect(() => planOpenApiContract(root, before, narrower, changedHardware, approved)).toThrow(
        'source value changed',
    );
    expect(() =>
        planOpenApiContract(root, before, narrower, before, approved.replace('- radio', '- gamma')),
    ).toThrow('target value differs');
});

test('translates a new report route while preserving a sample observation payload', () => {
    const before = catalog(observatory);
    const summary = 'Predicciones de luz polar';
    const response = 'Intervalos visibles desde la estación.';
    const sample = {description: 'Cortina verde sobre la ladera', brightness: 3};
    const after = catalog(
        {
            ...observatory,
            auroras: {
                get: {
                    operationId: 'findAuroras',
                    summary,
                    responses: {
                        200: {
                            description: response,
                            content: {'application/json': {example: sample}},
                        },
                    },
                },
            },
        },
        ['frames', 'telescopes', 'auroras'],
    );
    const patch = planOpenApiContract(root, before, after, after, approved)!;
    expect(patch.fragments).toEqual([summary, response]);
    const output = patch.apply(['Polar light forecasts', 'Intervals visible from the station.']);
    expect(output.startsWith(approved)).toBe(true);
    const inserted = parse(output).paths[paths.auroras].get;
    expect(inserted.summary).toBe('Polar light forecasts');
    expect(inserted.responses[200].content['application/json'].example).toEqual(sample);
});

test('removes a shutter state from both its inlined query and existing component', () => {
    const query = (values: string[]) => ({
        name: 'shutter',
        in: 'query',
        schema: {type: 'string', enum: values},
    });
    const build = (values: string[]) =>
        catalog({
            ...observatory,
            frames: frames({parameters: [{$ref: '#/ShutterState'}]}),
            ShutterState: query(values),
        });
    const before = build(['ARMED', 'JAMMED', 'EXPOSING']);
    const after = build(['ARMED', 'EXPOSING']);
    const localized = parse(approved);
    localized.paths[paths.frames].get.parameters = [query(['ARMED', 'JAMMED', 'EXPOSING'])];
    localized.components = {parameters: {ShutterState: query(['ARMED', 'JAMMED', 'EXPOSING'])}};
    const target = stringify(localized);
    const patch = planOpenApiContract(root, before, after, before, target)!;
    expect(patch.fragments).toEqual([]);
    expect(patch.apply([])).toBe(target.replace(/^ +- JAMMED\n/gm, ''));
});

test('adds an explanation beside the approved weather-state bullet', () => {
    const makeState = (entries: string[], description: string) => ({
        type: 'string',
        enum: entries,
        description,
    });
    const build = (entries: string[], description: string) =>
        catalog({
            ...observatory,
            frames: frames({
                parameters: [{name: 'weather', in: 'query', schema: {$ref: '#/WeatherState'}}],
            }),
            WeatherState: makeState(entries, description),
        });
    const opening = 'Usa el estado del sensor.\n\n* `CLEAR` - No hay bruma.\n';
    const newProse = 'El polvo oculta el horizonte.';
    const before = build(['CLEAR'], opening);
    const after = build(['CLEAR', 'HAZY'], opening + `* \`HAZY\` - ${newProse}\n`);
    const localized = parse(approved);
    localized.paths[paths.frames].get.parameters = [
        {
            name: 'weather',
            in: 'query',
            schema: makeState(
                ['CLEAR'],
                'Choose the condition reported by the mast.\n\n* :no-translate[`CLEAR`] :no-translate[-] The sky is transparent.\n',
            ),
        },
    ];
    const target = stringify(localized);
    const patch = planOpenApiContract(root, before, after, before, target)!;
    expect(patch.fragments).toEqual([newProse]);
    expect(() => patch.apply([])).toThrow('incomplete');
    expect(() => patch.apply(['Dust hangs\nover the horizon.'])).toThrow();
    const updated = patch.apply(['Dust obscures the horizon.']);
    expect(
        updated.replace(
            /^ +(?:- HAZY|\* :no-translate\[`HAZY`\] :no-translate\[-\] Dust obscures the horizon\.)\n/gm,
            '',
        ),
    ).toBe(target);
});

test.each([
    ['a code anchor', 'Busca el canal `nearIR`.', 'Watch the :no-translate[`nearIR`] channel.'],
    [
        'a note anchor',
        '{% note info "Observatorio remoto" %}\n\nEl techo se abre al anochecer.\n\n{% endnote %}',
        '{% note info "Remote station" %}\n\nThe roof opens after sunset.\n\n{% endnote %}',
    ],
])(
    'appends a detector reminder while retaining %s and approved bytes',
    (_scenario, source, localized) => {
        const build = (description: string) =>
            catalog({
                ...observatory,
                frames: frames({
                    parameters: [
                        {
                            name: 'detector',
                            in: 'query',
                            schema: {type: 'string', description},
                        },
                    ],
                }),
            });
        const reminder = 'Revisa el nivel de `darkCurrent` antes de enfocar.';
        const before = build(source + '\n');
        const after = build(source + '\n\n' + reminder + '\n');
        const targetTree = parse(approved);
        targetTree.paths[paths.frames].get.parameters = [
            {
                name: 'detector',
                in: 'query',
                schema: {type: 'string', description: localized + '\n'},
            },
        ];
        const lastApprovedLine = localized.split('\n').at(-1)!;
        const target = stringify(targetTree, {blockQuote: 'literal'}).replace(
            lastApprovedLine + '\n',
            lastApprovedLine + '  \n',
        );
        const patch = planOpenApiContract(root, before, after, before, target)!;
        expect(patch.fragments).toEqual([reminder]);
        expect(() => patch.apply(['Test `exposure` before focusing.'])).toThrow();
        const result = patch.apply(['Check `darkCurrent` before focusing.']);
        expect(result.replace(/\n +Check `darkCurrent` before focusing\.\n/, '')).toBe(target);
    },
);

test('publishes a formerly hidden report only when its operation ID stays unique', () => {
    const build = (extra: Record<string, unknown>) =>
        catalog(
            {
                ...observatory,
                auroras: {
                    get: {operationId: 'findAuroras', responses: {}, ...extra},
                },
            },
            ['frames', 'telescopes', 'auroras'],
        );
    const before = build({'x-hidden': true});
    const after = build({});
    const output = planOpenApiContract(root, before, after, before, approved)!.apply([]);
    expect(parse(output).paths[paths.auroras].get.operationId).toBe('findAuroras');
    expect(() =>
        planOpenApiContract(
            root,
            before,
            after,
            before,
            approved.replace('listTelescopes', 'findAuroras'),
        ),
    ).toThrow();

    const editedWithoutVisibilityChange = build({'x-units': 'nanotesla'});
    expect(() =>
        planOpenApiContract(root, after, editedWithoutVisibilityChange, after, approved),
    ).toThrow('target operation identity');
});

test('projects a preparation checklist while keeping its examples and YFM identities fixed', () => {
    const source = [
        '## Preparar el espectrógrafo {#calibration}',
        '',
        '{% cut "Alinear el prisma" %}',
        '',
        '- Ajusta `slitWidth` y consulta el [diagrama](../prism(revA).md) para `focalOffset`.',
        '- Anota :no-translate[SP-81] y {{stationName}}.',
        '',
        '~~~json',
        '{"lamp": "Neón"}',
        '~~~',
        '',
        '{% endcut %}',
        '',
    ].join('\n');
    const translated = [
        '## Prepare the spectrograph {#calibration}',
        '',
        '{% cut "Align the prism" %}',
        '',
        '- Find `focalOffset` in the [diagram](../prism(revA).md) and adjust `slitWidth`.',
        '- Record :no-translate[SP-81] and {{stationName}}.',
        '',
        '~~~json',
        '{"lamp": "Neón"}',
        '~~~',
        '',
        '{% endcut %}',
        '',
    ].join('\n');
    const before = catalog(observatory);
    const patch = planOpenApiContract(root, before, auroraReport(source), before, approved)!;
    expect(patch.fragments).toEqual([source]);
    const output = patch.apply([translated.trim()]);
    expect(parse(output).paths[paths.auroras].get.description).toBe(translated);
    expect(output.startsWith(approved)).toBe(true);

    for (const [token, replacement] of [
        ['`focalOffset`', '`slitWidth`'],
        ['prism(revA)', 'prism(revB)'],
        ['#calibration', '#tracking'],
        ['Neón', 'Argon'],
        ['\n- Record', '\n\nRecord'],
    ]) {
        expect(() => patch.apply([translated.replace(token, replacement)])).toThrow();
    }
});

test('joins a wrapped observation instruction but retains the two-line reading format', () => {
    const before = catalog(observatory);
    const source = [
        'Tras el eclipse, mueve la cámara al este',
        'y activa `slowTracking` para captar la corona.',
        '',
        'Lectura del primer detector  ',
        'Lectura del sensor auxiliar.',
        '',
    ].join('\n');
    const patch = planOpenApiContract(root, before, auroraReport(source), before, approved)!;
    expect(patch.fragments).toEqual([source.replace('este\ny activa', 'este y activa')]);
    const translated =
        'After the eclipse, turn the camera east and enable `slowTracking` to image the corona.\n\n' +
        'Primary detector reading  \nAuxiliary sensor reading.\n';
    expect(parse(patch.apply([translated.trim()])).paths[paths.auroras].get.description).toBe(
        translated,
    );
    expect(() =>
        patch.apply([translated.replace('reading  \nAuxiliary', 'reading\nAuxiliary')]),
    ).toThrow();
});

test('rejects an unprotected CommonMark reference definition in a new report description', () => {
    const before = catalog(observatory);
    const source =
        'La [carta estelar][meridiano] incluye el sector sur.\n\n[meridiano]: ../southern-sky.md\n';
    expect(() => planOpenApiContract(root, before, auroraReport(source), before, approved)).toThrow(
        'unsupported reference-link definitions',
    );
});

test('protects a shared YAML response anchor from an edit meant for one route', () => {
    const payload = {'application/json': {schema: {type: 'string', enum: ['AZIMUTH']}}};
    const response = (description: string, content: typeof payload) => ({
        200: {description, content},
    });
    const before = catalog({
        frames: frames({responses: response('Acimut almacenado', payload)}),
        telescopes: {
            get: {
                ...observatory.telescopes.get,
                responses: response('Acimut calibrado', structuredClone(payload)),
            },
        },
    });
    const widened = structuredClone(payload);
    widened['application/json'].schema.enum.push('ELEVATION');
    const after = catalog({
        frames: frames({responses: response('Acimut almacenado', widened)}),
        telescopes: observatory.telescopes,
    });
    const localized = parse(approved);
    localized.paths[paths.frames].get.responses = response('Recorded azimuth', payload);
    localized.paths[paths.telescopes].get.responses = response('Calibrated azimuth', payload);
    expect(() => planOpenApiContract(root, before, after, before, stringify(localized))).toThrow(
        'shared target reference',
    );
});

test.each(['entry', 'list'])('rejects deletion of an anchored bandwidth %s', (deletion) => {
    const before = catalog({
        ...observatory,
        frames: frames({'x-camera-bands': ['optical', 'radio', 'infrared']}),
    });
    const nextFrame: Record<string, unknown> = frames({
        'x-camera-bands': ['optical', 'radio'],
    }).get;
    if (deletion === 'list') {
        delete nextFrame['x-camera-bands'];
    }
    const after = catalog({...observatory, frames: {get: nextFrame}});
    const localized = approved
        .replace('- radio', '- radio\r\n        - &night infrared')
        .replace(
            'operationId: listTelescopes',
            'operationId: listTelescopes\r\n      x-alignment-band: *night',
        );
    expect(() => planOpenApiContract(root, before, after, before, localized)).toThrow(
        'unsupported YAML edit boundary',
    );
});

test.each([false, true])(
    'reuses a pointing parameter only when its identity is proven (reordered=%p)',
    (reordered) => {
        const coordinate = {
            in: 'query',
            name: 'declination',
            description: 'Ángulo al norte del ecuador celeste.',
            schema: {type: 'number'},
        };
        const instrument = {
            in: 'query',
            name: 'eyepiece',
            description: 'Aumento elegido para la visita.',
            schema: {type: 'string'},
        };
        const existing = frames({parameters: [coordinate, instrument]});
        const before = catalog({frames: existing}, ['frames']);
        const after = catalog(
            {
                frames: existing,
                telescopes: {get: {...observatory.telescopes.get, parameters: [coordinate]}},
            },
            ['frames', 'telescopes'],
        );
        const targetTree = parse(approved);
        delete targetTree.paths[paths.telescopes];
        const coordinateLabel = 'Angle north of the celestial equator.';
        const approvedParams = [
            {...coordinate, description: coordinateLabel},
            {...instrument, description: 'Magnification chosen for the visit.'},
        ];
        targetTree.paths[paths.frames].get.parameters = reordered
            ? approvedParams.reverse()
            : approvedParams;
        const patch = planOpenApiContract(root, before, after, before, stringify(targetTree))!;
        expect(patch.fragments).toEqual(reordered ? [coordinate.description] : []);
        const updated = parse(patch.apply(reordered ? [coordinateLabel] : []));
        expect(updated.paths[paths.telescopes].get.parameters[0]).toEqual({
            ...coordinate,
            description: coordinateLabel,
        });
    },
);

test('increases the minimum exposure and removes its deprecated flag without disturbing prose', () => {
    const sensor = {
        type: 'number',
        description: 'Duración en milisegundos.',
        minimum: 5,
        deprecated: true,
    };
    const build = (schema: Record<string, unknown>) =>
        catalog({
            ...observatory,
            frames: frames({parameters: [{name: 'duration', in: 'query', schema}]}),
        });
    const before = build(sensor);
    const after = build({type: 'number', minimum: 12, description: sensor.description});
    const localized = parse(approved);
    localized.paths[paths.frames].get.parameters = [
        {
            name: 'duration',
            in: 'query',
            schema: {...sensor, description: 'Exposure time in milliseconds.'},
        },
    ];
    const target = stringify(localized);
    const patch = planOpenApiContract(root, before, after, after, target)!;
    expect(patch.fragments).toEqual([]);
    expect(patch.apply([])).toBe(
        target.replace('minimum: 5', 'minimum: 12').replace(/^ +deprecated: true\n/m, ''),
    );
    expect(() =>
        planOpenApiContract(
            root,
            before,
            after,
            after,
            target.replace('minimum: 5', 'minimum: 10'),
        ),
    ).toThrow('target value differs');
});

test('refuses to update an existing component with two possible source definitions', () => {
    const spec = 'openapi: 3.0.3\npaths: {}\n';
    const mount = (coordinates: string[]) =>
        stringify({CoordinateFrame: {type: 'string', enum: coordinates}});
    const before = new Map([
        [root, spec],
        ['observatory/horizon.yaml', mount(['altitude', 'azimuth'])],
        ['observatory/ecliptic.yaml', mount(['longitude'])],
    ]);
    const after = new Map(before);
    after.set('observatory/horizon.yaml', mount(['azimuth']));
    const target =
        spec +
        'components:\n  schemas:\n' +
        mount(['altitude', 'azimuth'])
            .split('\n')
            .filter(Boolean)
            .map((line) => '    ' + line)
            .join('\n') +
        '\n';
    expect(() => planOpenApiContract(root, before, after, before, target)).toThrow(
        'ambiguous legacy component definition',
    );
});

test('refuses an append when an edited response no longer has its detector anchor', () => {
    const response = (description: string) =>
        catalog({
            ...observatory,
            frames: frames({responses: {200: {description}}}),
        });
    const source = 'El registro identifica `thermalSensor`.\n';
    const before = response(source);
    const after = response(source + '\nSolo se conserva la última lectura.\n');
    const localized = parse(approved);
    localized.paths[paths.frames].get.responses[200] = {
        description: 'The record identifies `lightMeter`.\n',
    };
    expect(() => planOpenApiContract(root, before, after, after, stringify(localized))).toThrow(
        'appended prose has no verified target paragraph',
    );
});
