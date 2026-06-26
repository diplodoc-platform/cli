import {readFile, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {afterAll, describe, expect, test} from 'vitest';

import {TestAdapter} from '../fixtures';

const MOCK = resolve(__dirname, '../mocks/content');
const CONFIG = join(MOCK, '.yfm');
const INDEX = join(MOCK, 'index.md');
const BROKEN = join(MOCK, 'missing-include.md');
const OUTPUT = join(MOCK, 'output');

const START = '<<<<<< YFM CONTENT START >>>>>>';
const END = '<<<<<< YFM CONTENT END >>>>>>';

/**
 * Extracts the content emitted between the stdout delimiter markers, ignoring
 * any framework banners (version line, build timer) printed around it.
 */
function content(stdout: string): string {
    const start = stdout.indexOf(START);
    const end = stdout.indexOf(END);

    expect(start, 'stdout must contain the content start marker').toBeGreaterThanOrEqual(0);
    expect(end, 'stdout must contain the content end marker').toBeGreaterThan(start);

    return stdout.slice(start + START.length, end).trim();
}

describe('content', () => {
    afterAll(async () => {
        await rm(OUTPUT, {recursive: true, force: true});
    });

    test('renders a single file to self-contained markdown', async () => {
        const report = await TestAdapter.content.run(INDEX, ['-c', CONFIG, '-f', 'md']);

        expect(report.code).toEqual(0);
        expect(content(report.stdout)).toMatchSnapshot();
    });

    test('renders a single file to an html content fragment', async () => {
        const report = await TestAdapter.content.run(INDEX, ['-c', CONFIG, '-f', 'html']);

        expect(report.code).toEqual(0);
        expect(content(report.stdout)).toMatchSnapshot();
    });

    test('writes raw content (without markers) to the -o file', async () => {
        const file = join(OUTPUT, 'page.html');
        const report = await TestAdapter.content.run(INDEX, [
            '-c',
            CONFIG,
            '-f',
            'html',
            '-o',
            file,
        ]);

        expect(report.code).toEqual(0);

        const written = await readFile(file, 'utf8');

        expect(written).not.toContain(START);
        expect(written).toMatchSnapshot();
    });

    test('exits with a non-zero code on a build error', async () => {
        const report = await TestAdapter.content.run(BROKEN, ['-c', CONFIG, '-f', 'md']);

        expect(report.code).toEqual(1);
        expect(report.stderr).toContain('does-not-exist.md');
    });
});
