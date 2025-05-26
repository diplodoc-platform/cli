import {describe, expect, it, vi} from 'vitest';
import {resolveConfig} from '../index';

vi.mock('node:fs/promises', () => ({
    readFile: vi.fn(),
}));

vi.mock('js-yaml', () => ({
    load: vi.fn((content) => JSON.parse(content)),
}));

import {readFile} from 'node:fs/promises';

describe('config module merge functionality', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('resolveConfig', () => {
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
