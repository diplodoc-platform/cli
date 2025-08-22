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
        const html = await TestAdapter.build.run(inputPath, outputPath + '-html', ['-j2', '-f', 'html']);
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

describe('Warnings', () => {
    test('mocks/warning/unreachable-autotitle', ({html}: TestResult) => {
        expectWarnings(html, [
            'WARN index.md: 1: YFM010 / unreachable-autotitle-anchor Auto title anchor is unreachable [Context: "[Unreachable autotitle anchor: "link.html#unknown_yfm010"][{#T}](./link.md#unknown_yfm010)"]',
        ]);
    });
});

function expectErrors(report: Report, errors: string[]) {
    expect(report.code).toEqual(1);

    for (const error of errors) {
        expect(report.errors).toContain(error);
    }
}

function expectWarnings(report: Report, warnings: string[]) {
    expect(report.warns.length).toEqual(warnings.length);

    for (const warn of warnings) {
        expect(report.warns).toContain(warn);
    }
}
