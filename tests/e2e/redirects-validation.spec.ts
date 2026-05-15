import {describe, expect, it} from 'vitest';

import {TestAdapter, getTestPaths} from '../fixtures';

describe('Redirects validation', () => {
    it('should emit an error on an unparseable redirects.yaml', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/redirects-validation/unparseable');

        const report = await TestAdapter.build.run(inputPath, outputPath, ['-f', 'md']);

        expect(report.code).toBe(1);
        expect(report.errors).toContainEqual(expect.stringMatching(/redirects.yaml parsing error/));
    });

    it.skip('should emit a warning when supplied with a `redirects.yaml` that mentions file extensions', async () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/redirects-validation/extensions-deprecation',
        );

        const report = await TestAdapter.build.run(inputPath, outputPath, ['-f', 'md']);

        expect(report.code).toBe(0);
        expect(report.warns).toContainEqual(
            expect.stringMatching(/Redirects with explicit extensions are deprecated./),
        );
    });

    it('should emit an error when an invalid regular expression pattern is encountered', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/redirects-validation/invalid-regex');

        const report = await TestAdapter.build.run(inputPath, outputPath, ['-f', 'md']);

        expect(report.code).toBe(1);
        expect(report.errors).toContainEqual(
            expect.stringMatching(
                /Redirects configuration results in a non-valid regular expression/,
            ),
        );
    });

    it('should emit an error when a redirect is malformed', async () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/redirects-validation/malformed-redirect',
        );

        const report = await TestAdapter.build.run(inputPath, outputPath, ['-f', 'md']);

        expect(report.code).toBe(1);
        expect(report.errors).toContainEqual(
            expect.stringMatching(/One of the two parameters is missing/),
        );
    });

    it('should emit an error when a redirect leads to the same path', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/redirects-validation/same-path');

        const report = await TestAdapter.build.run(inputPath, outputPath, ['-f', 'md']);

        expect(report.code).toBe(1);
        expect(report.errors).toContainEqual(expect.stringMatching(/Parameters must be different/));
    });
});
