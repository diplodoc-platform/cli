/* eslint-disable @typescript-eslint/no-explicit-any */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BaseProgram, getHooks} from './index';
import {getConfigDefaults, withConfigDefaults} from './decorators';

vi.mock('../config', () => ({
    resolveConfig: vi.fn(),
    withConfigUtils: vi.fn((path, config) => ({
        ...config,
        resolve: vi.fn(),
        [Symbol.for('configPath')]: path,
    })),
    scope: vi.fn(),
    strictScope: vi.fn(),
    configPath: Symbol.for('configPath'),
}));

describe('program module', () => {
    describe('withConfigDefaults decorator', () => {
        it('should merge config defaults correctly', () => {
            @withConfigDefaults(() => ({
                option1: 'baseValue1',
                option2: 'baseValue2',
                nested: {
                    nestedOption1: 'baseNestedValue1',
                },
            }))
            class BaseClass {}

            @withConfigDefaults(() => ({
                option1: 'childValue1',
                option3: 'childValue3',
                nested: {
                    nestedOption1: 'childNestedValue1',
                    nestedOption2: 'childNestedValue2',
                },
            }))
            class ChildClass extends BaseClass {}

            const instance = new ChildClass();
            const defaults = getConfigDefaults(instance as any);

            const expected = {
                option1: 'childValue1',
                option2: 'baseValue2',
                option3: 'childValue3',
                nested: {
                    nestedOption1: 'childNestedValue1',
                    nestedOption2: 'childNestedValue2',
                },
            };

            expect(defaults).toEqual(expected);
        });
    });

    describe('BaseProgram', () => {
        describe('hookConfig method', () => {
            beforeEach(() => {
                vi.resetAllMocks();
            });

            it('should merge config with args correctly', async () => {
                class TestProgram extends BaseProgram {
                    apply() {}

                    async action() {}

                    async testHookConfig(config: any, args: any) {
                        // @ts-ignore - use private method
                        return this['hookConfig'](config, args);
                    }
                }

                const program = new TestProgram({
                    input: '/test/input' as AbsolutePath,
                    quiet: false,
                    strict: false,
                });

                const mockRawConfigHook = vi.fn();
                const mockConfigHook = vi.fn((config) => config);

                getHooks(program).RawConfig.tap('test', mockRawConfigHook);
                getHooks(program).Config.tap('test', mockConfigHook);

                program.args = vi.fn().mockReturnValue({
                    argOption1: 'argValue1',
                    argOption2: 'argValue2',
                });

                const config = {
                    option1: 'configValue1',
                    option2: 'configValue2',
                    extensions: [],
                    nested: {
                        nestedOption1: 'nestedConfigValue1',
                    },
                };

                const result = await program.testHookConfig(config, {});

                expect(mockRawConfigHook).toHaveBeenCalled();
                expect(mockConfigHook).toHaveBeenCalled();
                expect(program.args).toHaveBeenCalled();

                const expected = {
                    option1: 'configValue1',
                    option2: 'configValue2',
                    argOption1: 'argValue1',
                    argOption2: 'argValue2',
                    extensions: [],
                    nested: {
                        nestedOption1: 'nestedConfigValue1',
                    },
                };

                expect(result).toEqual(expected);
            });
        });

        describe('complex merging scenarios', () => {
            beforeEach(() => {
                vi.resetAllMocks();
            });

            it('should correctly merge complex nested objects', async () => {
                class TestProgram extends BaseProgram {
                    apply() {}
                    async action() {}

                    async testHookConfig(config: any, args: any) {
                        // @ts-ignore - use private method
                        return this['hookConfig'](config, args);
                    }
                }

                const program = new TestProgram({
                    input: '/test/input' as AbsolutePath,
                    quiet: false,
                    strict: false,
                });

                const hooks = getHooks(program);
                hooks.RawConfig.tap('test', vi.fn());
                hooks.Config.tap(
                    'test',
                    vi.fn((config) => config),
                );

                const config = {
                    option1: 'configValue1',
                    option2: 'configValue2',
                    extensions: [],
                    nested: {
                        nestedOption1: 'nestedConfigValue1',
                        deepNested: {
                            deepOption1: 'deepConfigValue1',
                        },
                    },
                    array: ['item1', 'item2'],
                };

                program.args = vi.fn().mockReturnValue({
                    option1: 'argValue1',
                    option3: 'argValue3',
                    extensions: [],
                    nested: {
                        nestedOption2: 'nestedArgValue2',
                        deepNested: {
                            deepOption2: 'deepArgValue2',
                        },
                    },
                    array: ['item3'],
                });

                const result = await program.testHookConfig(config, {});

                const expected = {
                    option1: 'argValue1',
                    option2: 'configValue2',
                    option3: 'argValue3',
                    extensions: [],
                    nested: {
                        nestedOption1: 'nestedConfigValue1',
                        nestedOption2: 'nestedArgValue2',
                        deepNested: {
                            deepOption1: 'deepConfigValue1',
                            deepOption2: 'deepArgValue2',
                        },
                    },
                    array: ['item3', 'item2'],
                };

                expect(result).toEqual(expected);
            });
        });
    });
});
