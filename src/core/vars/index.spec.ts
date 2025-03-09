import type {VarsServiceConfig} from './VarsService';

import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {when} from 'vitest-when';
import {dedent} from 'ts-dedent';

import {setupRun} from '~/commands/build/__tests__';

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
        when(run.read).calledWith(join(run.input, file)).thenResolve(data);
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
        describe('load', () => {
            test('should load presets file default scope', 'test.md');

            test('should load presets file target scope', 'test.md', {varsPreset: 'internal'});

            test('should override default presets with vars', 'test.md', {vars: {field1: 'value6'}});

            test('should override target presets with vars', 'test.md', {varsPreset: 'internal', vars: {field1: 'value6'}});

            test('should merge deep presets 1', './subfolder/subfolder/subfolder/test.md');

            test('should merge deep presets 2', './subfolder/subfolder/subfolder/subfolder/test.md');

            test('should not merge presets on lower levels', './subfolder/subfolder/test.md');

            test('should handle empty preset', './empty/test.md');

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

            // test('should use vars if presets not found', ENOENT, {vars: {field1: 'value6'}});

            // it('should throw parse error', async () => {
            //     await expect(() => call('!@#', {vars: {field1: 'value6'}})).rejects.toThrow(
            //         YAMLException,
            //     );
            // });
            //
            // it('should load super layers', async () => {
            //     const service = prepare({varsPreset: 'internal'});
            //
            //     const result = await service.for(
            //         'subfolder/subfolder/subfolder/test.md' as NormalizedPath,
            //     );
            //
            //     expect(service.dump(result)).toMatchSnapshot();
            // });
            //
            // it('should call PresetsLoaded hook', async () => {
            //     const service = prepare();
            //
            //     const spy = vi.fn();
            //
            //     getHooks(service).PresetsLoaded.tap('Test', spy);
            //
            //     await service.load('presets.yaml' as NormalizedPath);
            //
            //     expect(spy).toHaveBeenCalledWith({default: {field1: 'value1'}}, 'presets.yaml');
            // });
            //
            // it('should call Resolved hook', async () => {
            //     const service = prepare();
            //
            //     const spy = vi.fn();
            //
            //     getHooks(service).Resolved.tap('Test', spy);
            //
            //     await service.load('presets.yaml' as NormalizedPath);
            //
            //     expect(spy).toHaveBeenCalledWith({field1: 'value1'}, 'presets.yaml');
            // });
            //
            // it('should allow content updating in PresetsLoaded hook', async () => {
            //     const service = prepare(dedent`
            //         default:
            //           field1: value1
            //     `);
            //
            //     getHooks(service).PresetsLoaded.tap('Test', (presets) => {
            //         presets.default.field1 = 'value2';
            //
            //         return presets;
            //     });
            //
            //     const result = await service.load('presets.yaml' as NormalizedPath);
            //
            //     expect(service.dump(result)).toMatchSnapshot();
            // });
            //
            // it('should allow content extending in PresetsLoaded hook', async () => {
            //     const service = prepare(dedent`
            //         default:
            //           field1: value1
            //     `);
            //
            //     getHooks(service).PresetsLoaded.tap('Test', (presets) => {
            //         presets.default.field2 = 'value2';
            //
            //         return presets;
            //     });
            //
            //     const result = await service.load('presets.yaml' as NormalizedPath);
            //
            //     expect(service.dump(result)).toMatchSnapshot();
            // });
            //
            // it('should load content only once', async () => {
            //     const service = prepare(dedent`
            //         default:
            //           field1: value1
            //     `);
            //
            //     const spy1 = vi.fn();
            //     const spy2 = vi.fn();
            //
            //     getHooks(service).PresetsLoaded.tap('Test', spy1);
            //     getHooks(service).Resolved.tap('Test', spy2);
            //
            //     await service.load('presets.yaml' as NormalizedPath);
            //     await service.load('presets.yaml' as NormalizedPath);
            //
            //     expect(spy1).toHaveBeenCalledOnce();
            //     expect(spy2).toHaveBeenCalledOnce();
            // });
        });
    });
});
