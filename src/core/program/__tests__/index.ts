import {describe, expect, it, vi} from 'vitest';
import {BaseProgram, getHooks} from '../index';
import {getConfigDefaults, withConfigDefaults} from '../decorators';

vi.mock('~/core/config', () => ({
    resolveConfig: vi.fn(),
    withConfigUtils: vi.fn((path, config) => ({
        ...config,
        resolve: vi.fn(),
        [Symbol.for('configPath')]: path,
    })),
    scope: vi.fn(),
    strictScope: vi.fn(),
}));

describe('program module merge functionality', () => {
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

    describe('merge in BaseProgram', () => {
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
                nested: {
                    nestedOption1: 'nestedConfigValue1',
                },
            };

            expect(result).toEqual(expected);
        });
    });

    describe('BaseProgram integration', () => {
        it('should merge config with args during initialization', async () => {
            const resolveConfig = require('~/core/config').resolveConfig;
            resolveConfig.mockResolvedValue({
                option1: 'configValue1',
                nested: {
                    nestedOption1: 'nestedConfigValue1',
                },
            });

            class TestProgram extends BaseProgram {
                apply() {}

                async action() {}

                async testHookConfig(config: any, args: any) {
                    // @ts-ignore - use private method
                    return this['hookConfig'](config, args);
                }

                getTestConfig() {
                    return this.config;
                }
            }

            const program = new TestProgram({
                input: '/test/input' as AbsolutePath,
                quiet: false,
                strict: false,
            });

            program.args = vi.fn().mockReturnValue({
                argOption1: 'argValue1',
                nested: {
                    nestedOption2: 'nestedArgValue2',
                },
            });

            const hooks = getHooks(program);
            hooks.RawConfig.tap('test', vi.fn());
            hooks.Config.tap(
                'test',
                vi.fn((config) => config),
            );

            const config = {
                option1: 'configValue1',
                nested: {
                    nestedOption1: 'nestedConfigValue1',
                },
            };

            const result = await program.testHookConfig(config, {});

            const expected = {
                option1: 'configValue1',
                argOption1: 'argValue1',
                nested: {
                    nestedOption1: 'nestedConfigValue1',
                    nestedOption2: 'nestedArgValue2',
                },
            };

            expect(result).toMatchObject(expected);
        });
    });
});
