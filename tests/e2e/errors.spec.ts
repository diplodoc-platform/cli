import type {Report} from '../fixtures/runners/types';

import {describe, expect, it} from 'vitest';
import {TestAdapter, getTestPaths} from '../fixtures';

type TestResult = {
    md: Report;
    html: Report;
}

function test(path: string, expect: Function) {
    it(path, async () => {
        const {inputPath, outputPath} = getTestPaths(path);

        const md = await TestAdapter.build.run(inputPath, outputPath, ['-j2', '-f', 'md']);
        const html = await TestAdapter.build.run(outputPath, outputPath + '-html', ['-j2', '-f', 'html']);

        return expect({md, html});
    });
}

describe('Errors', () => {
    test('mocks/errors/unreachable-link', ({html}: TestResult) => {
        expectErrors(html, [
            'ERR index.md: 1: YFM003 / unreachable-link Link is unreachable [Context: "[Unreachable link: "exists.html"][existing file](./exists.md)"]',
            'ERR index.md: 2: YFM003 / unreachable-link Link is unreachable [Context: "[Unreachable link: "missed.html"][missed file](./missed.md)"]'
        ]);
    });
});

function expectErrors(report: Report, errors: string[]) {
    expect(report.code).toEqual(1);

    for (const error of errors) {
        expect(report.errors).toContain(error);
    }
}
