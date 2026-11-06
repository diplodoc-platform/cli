import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

import {TestAdapter, getTestPaths} from '../fixtures';

describe('OpenAPI preset conditions', () => {
    it.each([
        {name: 'default preset', args: '', noIndex: true},
        {name: 'selected preset', args: '--vars-preset public', noIndex: false},
        {name: 'CLI override', args: '--vars {"noIndexOperations":[]}', noIndex: false},
    ])('uses $name when generating endpoint metadata', async ({args, noIndex}) => {
        const {inputPath, outputPath} = getTestPaths('mocks/openapi-presets');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2html: false,
            args,
        });

        const page = readFileSync(resolve(outputPath, 'api/pets/listPets.md'), 'utf8');
        const otherPage = readFileSync(resolve(outputPath, 'api/health.md'), 'utf8');
        expect(page.includes('noIndex: true')).toBe(noIndex);
        expect(otherPage).not.toContain('noIndex: true');

        const nestedPage = readFileSync(resolve(outputPath, 'nested/api/health.md'), 'utf8');
        const nestedOtherPage = readFileSync(
            resolve(outputPath, 'nested/api/pets/listPets.md'),
            'utf8',
        );
        expect(nestedPage.includes('noIndex: true')).toBe(noIndex);
        expect(nestedOtherPage).not.toContain('noIndex: true');
    });
});
