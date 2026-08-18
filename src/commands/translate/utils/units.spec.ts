import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {loadTranslationUnits} from './units';

function file(content: string, name = 'article.md') {
    const dir = mkdtempSync(join(tmpdir(), 'yfm-translate-units-'));
    const path = join(dir, name);
    mkdirSync(join(dir, 'ru'), {recursive: true});
    writeFileSync(path, content);
    return path as AbsolutePath;
}

describe('translate units loader', () => {
    describe('loadTranslationUnits', () => {
        it('should extract translation units from a markdown file', async () => {
            const inputPath = file('# Заголовок\n\nПервое предложение. Второе предложение.\n');

            const {units} = await loadTranslationUnits({
                inputPath,
                path: 'ru/article.md',
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
            });

            expect(units).toHaveLength(3);
            expect(units[0]).toContain('Заголовок');
            expect(units[1]).toContain('Первое предложение.');
            expect(units[2]).toContain('Второе предложение.');
        });

        it('should apply liquid conditions when vars are provided', async () => {
            const inputPath = file(
                '{% if audience == "internal" %}\nВнутреннее.\n{% endif %}\n\nОбщее.\n',
            );

            const withVars = await loadTranslationUnits({
                inputPath,
                path: 'ru/article.md',
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {audience: 'external'},
            });
            const withoutVars = await loadTranslationUnits({
                inputPath,
                path: 'ru/article.md',
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
            });

            // The failed condition drops the internal block entirely.
            expect(withVars.units.join('\n')).not.toContain('Внутреннее');
            expect(withVars.units.join('\n')).toContain('Общее');
            // Without vars liquid is not applied and the text stays.
            expect(withoutVars.units.join('\n')).toContain('Внутреннее');
        });

        it('should return no units for an empty file', async () => {
            const inputPath = file('');

            const {units} = await loadTranslationUnits({
                inputPath,
                path: 'ru/article.md',
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
            });

            expect(units).toEqual([]);
        });
    });
});
