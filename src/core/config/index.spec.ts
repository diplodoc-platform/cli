import {beforeEach, describe, expect, it, vi} from 'vitest';

import {resolveConfig, toggleable} from '.';

vi.mock('node:fs/promises', () => ({
    readFile: vi.fn(),
}));

vi.mock('js-yaml', () => ({
    load: vi.fn((content) => JSON.parse(content)),
}));

import {readFile} from 'node:fs/promises';

describe('config utils', () => {
    describe('toggleable', () => {
        it('should use args with priority', () => {
            const result = toggleable('field', {field: true}, {field: false});

            expect(result).toEqual({enabled: true});
        });

        it('should use config base value', () => {
            expect(toggleable('field', {}, {field: true})).toEqual({enabled: true});
            expect(toggleable('field', {}, {field: false})).toEqual({enabled: false});
        });

        it('should use config default value', () => {
            expect(toggleable('field', {}, {field: {}})).toEqual({enabled: true});
        });

        it('should use config enabled value', () => {
            expect(toggleable('field', {}, {field: {enabled: true}})).toEqual({enabled: true});
            expect(toggleable('field', {}, {field: {enabled: false}})).toEqual({enabled: false});
        });

        it('should use deep config fields', () => {
            expect(toggleable('field', {field: true}, {field: {deep: 1}})).toEqual({
                enabled: true,
                deep: 1,
            });
        });
    });

    describe('resolveConfig', () => {
        beforeEach(() => {
            vi.resetAllMocks();
        });

        it('should merge defaults with loaded config data', async () => {
            const mockConfigPath = '/path/to/config.yaml';
            const mockConfigContent = JSON.stringify({
                option1: 'value1',
                option2: 'value2',
                nested: {
                    nestedOption1: 'nestedValue1',
                },
            });
            const mockDefaults = {
                option1: 'defaultValue1',
                option3: 'defaultValue3',
                nested: {
                    nestedOption1: 'defaultNestedValue1',
                    nestedOption2: 'defaultNestedValue2',
                },
            };

            (readFile as any).mockResolvedValue(mockConfigContent);

            const result = await resolveConfig(mockConfigPath as any, {
                defaults: mockDefaults,
            });

            const expected = {
                option1: 'value1',
                option2: 'value2',
                option3: 'defaultValue3',
                nested: {
                    nestedOption1: 'nestedValue1',
                    nestedOption2: 'defaultNestedValue2',
                },
            };

            const resultWithoutUtils = {...result};
            delete (resultWithoutUtils as any).resolve;
            delete (resultWithoutUtils as any)[Symbol.for('configPath')];

            expect(resultWithoutUtils).toEqual(expected);
            expect(readFile).toHaveBeenCalledWith(mockConfigPath, 'utf8');
        });

        it('should use fallback when config file not found', async () => {
            const mockConfigPath = '/path/to/nonexistent.yaml';
            const mockFallback = {
                option1: 'fallbackValue1',
                option2: 'fallbackValue2',
            };

            const error = new Error('File not found') as any;
            error.code = 'ENOENT';
            (readFile as any).mockRejectedValue(error);

            const result = await resolveConfig(mockConfigPath as any, {
                fallback: mockFallback,
            });

            const resultWithoutUtils = {...result};
            delete (resultWithoutUtils as any).resolve;
            delete (resultWithoutUtils as any)[Symbol.for('configPath')];

            expect(resultWithoutUtils).toEqual(mockFallback);
            expect(readFile).toHaveBeenCalledWith(mockConfigPath, 'utf8');
        });
    });
});
