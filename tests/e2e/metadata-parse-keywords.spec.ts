import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, test} from 'vitest';

import {TestAdapter, generateMapTestTemplate, getTestPaths} from '../fixtures';

function findFile(dir: string, predicate: (name: string) => boolean): string | null {
    try {
        for (const name of readdirSync(dir, {withFileTypes: true})) {
            const full = join(dir, name.name);

            if (name.isDirectory()) {
                const found = findFile(full, predicate);

                if (found) {
                    return found;
                }
            } else if (predicate(name.name)) {
                return full;
            }
        }
    } catch {
        return null;
    }

    return null;
}

describe('Parse and render HTML meta keywords', () => {
    generateMapTestTemplate(
        'md2html with structured keywords',
        'mocks/metadata/parse-html-keywords',
        {
            md2md: false,
            md2html: true,
        },
    );

    test('should parse array of objects with presets and flatten keywords into meta tag', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/metadata/parse-html-keywords');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
        });

        const htmlPath = findFile(outputPath, (n) => n === 'index.html');
        expect(htmlPath).toBeTruthy();
        if (!htmlPath) {
            throw new Error('htmlPath is null');
        }

        const html = readFileSync(htmlPath, 'utf8');

        const expectedKeywords = [
            'Есть переменная Yandex',
            'Yandex',
            'с пробелами Yandex',
            'Нет переменной',
            'Совсем нет тут',
            'Дефис есть яндекс такси',
            'Дефис нет',
            'Микс Yandex + + Москва',
            'слитноYandexтекст',
            'числа Yandex, 1234567890, YNX-123',
        ].join(', ');

        const expectedMeta = `<meta name="keywords" content="${expectedKeywords}">`;
        expect(html).toContain(expectedMeta);
    }, 45000);
});
