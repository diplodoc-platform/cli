import type {VarsServiceConfig} from './VarsService';

import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {when} from 'vitest-when';
import {dedent} from 'ts-dedent';

import {setupRun} from '~/commands/build/__tests__';
import {normalizePath} from '~/core/utils';

import {VarsService} from './VarsService';

type Options = Partial<VarsServiceConfig>;

const content = {
    './presets.yaml': dedent`
        default:
          field1: value1
          override1: value2
          override2: value2
          override3: value2
          override4: value2
        internal:
          field2: value1
          override1: value1
    `,
    './empty/presets.yaml': '',
    './nested/presets.yaml': dedent`
        default:
          deep:
            deep:
              deep:
                var: value
    `,
    './subfolder/presets.yaml': dedent`
        default:
          sub1: value1
          sub2: value2
          override2: value1
          override5: value2
        internal:
          sub2: value1
          override3: value1
          override6: value2
    `,
    // './subfolder/subfolder/presets.yaml': ENOENT,
    './subfolder/subfolder/subfolder/presets.yaml': dedent`
        default:
          subsub1: value2
          override4: value2
          override5: value1
        internal:
          subsub1: value1
          subsub2: value1
          override4: value1
          override6: value1
    `,
};

function prepare(options: Options = {}) {
    const run = setupRun({
        varsPreset: options.varsPreset,
        vars: options.vars || {},
    });

    const service = new VarsService(run);

    when(run.glob)
        .calledWith('**/presets.yaml', expect.anything())
        .thenResolve(Object.keys(content) as NormalizedPath[]);

    for (const [file, data] of Object.entries(content)) {
        when(run.read)
            .calledWith(normalizePath(join(run.input, file)) as AbsolutePath)
            .thenResolve(data);
    }

    return service;
}

async function call(path: RelativePath, options: Options = {}) {
    const service = prepare(options);

    await service.init();

    expect(service.dump(service.for(path))).toMatchSnapshot();
}

function test(name: string, path: string, options: Options = {}) {
    it(name, async () => call(path as RelativePath, options));
}

describe('vars', () => {
    describe('service', () => {
        describe('proxy', () => {
            it('should handle `has` trap', async () => {
                const service = prepare();

                await service.init();

                const vars = service.for('test.md' as RelativePath);

                expect('field1' in vars).toEqual(true);
                expect('field10' in vars).toEqual(false);
            });

            it('should handle `get` trap', async () => {
                const service = prepare();

                await service.init();

                const vars = service.for('test.md' as RelativePath);

                expect(vars.field1).toEqual('value1');
                expect(vars['field1']).toEqual('value1');
                expect(vars.field10).toEqual(undefined);
                expect(vars['field10']).toEqual(undefined);
            });

            it('should handle `hasOwnProperty` trap', async () => {
                const service = prepare();

                await service.init();

                const vars = service.for('test.md' as RelativePath);

                expect(Object.hasOwnProperty.call(vars, 'field1')).toEqual(true);
                expect(Object.hasOwnProperty.call(vars, 'field10')).toEqual(false);
                // eslint-disable-next-line no-prototype-builtins
                expect(vars.hasOwnProperty('field1')).toEqual(true);
                // eslint-disable-next-line no-prototype-builtins
                expect(vars.hasOwnProperty('field10')).toEqual(false);
            });

            it('should track dependencies', async () => {
                const service = prepare();
                await service.init();
                const vars = service.for('./test.md' as RelativePath);

                expect(vars.field1).toEqual('value1');
                expect(vars.override1).toEqual('value2');
                expect(service.relations.hasNode('presets.yaml#default.field1')).toBeTruthy();
                expect(service.relations.hasNode('presets.yaml#default.override1')).toBeTruthy();
            });

            it('should track dependencies from scopes', async () => {
                const service = prepare({varsPreset: 'internal'});
                await service.init();
                const vars = service.for('./test.md' as RelativePath);

                expect(vars.field1).toEqual('value1');
                expect(vars.override1).toEqual('value1');
                expect(service.relations.hasNode('presets.yaml#default.field1')).toBeTruthy();
                expect(service.relations.hasNode('presets.yaml#internal.override1')).toBeTruthy();
            });

            it('should track dependencies for nested objects', async () => {
                const service = prepare();
                await service.init();
                const vars = service.for('./nested/test.md' as RelativePath);

                // @ts-ignore
                expect(vars.deep.deep.deep.var).toEqual('value');
                expect(
                    service.relations.hasNode('nested/presets.yaml#default.deep.deep.deep.var'),
                ).toBeTruthy();
            });

            it('should track missed dependency for nested objects', async () => {
                const service = prepare({varsPreset: 'internal'});
                await service.init();
                const vars = service.for('./nested/test.md' as RelativePath);

                try {
                    // @ts-ignore
                    expect(vars.deep.deep.deep.missed).toEqual(undefined);
                } catch {}

                expect(
                    service.relations.hasNode('missed#default.deep.deep.deep.missed'),
                ).toBeTruthy();
                expect(
                    service.relations.hasNode('missed#internal.deep.deep.deep.missed'),
                ).toBeTruthy();
            });
        });

        describe('load', () => {
            test('should load presets file default scope', 'test.md');

            test('should load presets file target scope', 'test.md', {varsPreset: 'internal'});

            test('should load presets file target empty scope', 'test.md', {
                varsPreset: 'external',
            });

            test('should override default presets with vars', 'test.md', {
                vars: {field1: 'value6'},
            });

            test('should override target presets with vars', 'test.md', {
                varsPreset: 'internal',
                vars: {field1: 'value6'},
            });

            test('should merge deep presets 1', './subfolder/subfolder/subfolder/test.md');

            test(
                'should merge deep presets 2',
                './subfolder/subfolder/subfolder/subfolder/test.md',
            );

            test('should not merge presets on lower levels', './subfolder/subfolder/test.md');

            test('should handle empty preset', './empty/test.md');
        });
    });
});
