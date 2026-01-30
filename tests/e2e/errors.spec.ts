import type {Report} from '../fixtures/runners/types';

import {describe, expect, it} from 'vitest';

import {TestAdapter, getTestPaths} from '../fixtures';

type TestResult = {
    md: Report;
    html: Report;
};

function test(path: string, expect: Function, additionalArgs: string[] = []) {
    it(path, async () => {
        const {inputPath, outputPath} = getTestPaths(path);

        const md = await TestAdapter.build.run(inputPath, outputPath, [
            '-j2',
            '-f',
            'md',
            ...additionalArgs,
        ]);
        const html = await TestAdapter.build.run(inputPath, outputPath + '-html', [
            '-j2',
            '-f',
            'html',
            ...additionalArgs,
        ]);
        return expect({md, html});
    });
}

describe('Errors', () => {
    test('mocks/errors/unreachable-link', ({html}: TestResult) => {
        expectErrors(html, [
            'ERR index.md: 1: YFM003 / unreachable-link Link is unreachable [Context: "Unreachable link: "exists.html"; Reason: File is not declared in toc; Line: 1"]',
            'ERR index.md: 2: YFM003 / unreachable-link Link is unreachable [Context: "Unreachable link: "missed.html"; Reason: File is not declared in toc; Line: 2"]',
        ]);
    });

    test('mocks/errors/object-validation', ({html}: TestResult) => {
        expectErrors(html, [
            'ERR Invalid toc structure in toc.yaml -> toc.yaml at items[1].name: found [object Object] value',
            'ERR Invalid toc structure in toc.yaml -> toc.yaml at items[2].href: found [object Object] value',
            'ERR Invalid toc structure in toc.yaml -> toc.yaml at items[3].items[0].name: found [object Object] value',
            'ERR Invalid toc structure in toc.yaml -> toc.yaml at items[4].title: found [object Object] value',
            'ERR Invalid toc structure in toc.yaml -> toc.yaml at items[5].label: found [object Object] value',
            'ERR Invalid toc structure in toc.yaml -> toc.yaml at items[6].navigation: found [object Object] value',
        ]);
    });

    test(
        'mocks/errors/max-asset-size',
        ({md, html}: TestResult) => {
            expectErrors(md, [
                'ERR YFM013 _images/large-image.png: YFM013 / File asset limit exceeded: 3057 (limit is 2048)',
            ]);
            expectErrors(html, [
                'ERR YFM013 _images/large-image.png: YFM013 / File asset limit exceeded: 3057 (limit is 2048)',
            ]);
        },
        ['--max-asset-size', '2K'],
    );

    it('translate extract with filtered links', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/errors/extract-filtered-link');

        const result = await TestAdapter.extract.run(inputPath, outputPath, [
            '--source',
            'ru-RU',
            '--target',
            'es-ES',
            '--filter',
        ]);

        expect(result.code).toEqual(1);

        expect(result.errors).toEqual([
            "ERR File index.md contains link to filtered.md, which was filtered from toc.yaml or it's not been included initially",
            "ERR File index.md contains link to filtered2.md, which was filtered from toc.yaml or it's not been included initially",
            "ERR File index.md contains link to filtered2.md, which was filtered from toc.yaml or it's not been included initially",
            "ERR File index.md contains link to filtered3.md, which was filtered from toc.yaml or it's not been included initially",
        ]);
    });
});

describe('Warnings', () => {
    test('mocks/warning/unreachable-autotitle', ({html}: TestResult) => {
        expectWarnings(html, [
            'WARN index.md: 1: YFM010 / unreachable-autotitle-anchor Auto title anchor is unreachable [Context: "[Unreachable autotitle anchor: "link.html#unknown_yfm010"] [{#T}](./link.md#unknown_yfm010)"]',
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
