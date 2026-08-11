import type {Mock} from 'vitest';
import type {TranslateConfig} from '~/commands/translate';
import type {YandexTranslationConfig} from '.';

import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import axios from 'axios';

import {Provider} from './provider';

vi.mock('axios', async (importOriginal) => {
    const actual = (await importOriginal()) as {default: object};

    return {
        ...actual,
        default: vi.fn(),
    };
});

const request = axios as unknown as Mock;

type GlossaryPair = {sourceText: string; translatedText: string};

function makeProject() {
    const root = mkdtempSync(join(tmpdir(), 'yfm-translate-yandex-'));
    const input = join(root, 'docs');
    const output = join(root, 'out');

    mkdirSync(join(input, 'ru'), {recursive: true});
    writeFileSync(join(input, 'ru', 'index.md'), 'Сборка документации.');

    return {input, output};
}

function makeConfig(glossaryPairs: GlossaryPair[]) {
    const {input, output} = makeProject();

    return {
        input,
        output,
        auth: 'Bearer token',
        folder: 'folder',
        source: {language: 'ru', locale: 'RU'},
        target: [{language: 'en', locale: 'US'}],
        vars: {},
        dryRun: false,
        timeout: 1000,
        quiet: true,
        glossaryPairs,
    } as unknown as TranslateConfig & YandexTranslationConfig;
}

describe('translate yandex provider', () => {
    beforeEach(() => {
        request.mockReset();
        // Echo the source texts back: the request payload is what matters here,
        // and compose needs a translation for every extracted unit.
        request.mockImplementation(async ({data}: {data: {texts: string[]}}) => ({
            data: {translations: data.texts.map((text) => ({text}))},
        }));
        vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            throw new Error(`Unexpected process.exit(${code})`);
        }) as never);
    });

    it('should send configured glossary pairs with the translation request', async () => {
        const config = makeConfig([{sourceText: 'сборка', translatedText: 'build'}]);
        const provider = new Provider(config);

        await provider.translate(['ru/index.md'], config);

        expect(request).toHaveBeenCalled();

        const [{data}] = request.mock.calls[0];

        expect(data.glossaryConfig).toEqual({
            glossaryData: {
                glossaryPairs: [{sourceText: 'сборка', translatedText: 'build'}],
            },
        });
    });

    it('should send a single request per batch', async () => {
        const config = makeConfig([]);
        const provider = new Provider(config);

        await provider.translate(['ru/index.md'], config);

        expect(request).toHaveBeenCalledOnce();
    });

    it('should not send glossary config when glossary is not configured', async () => {
        const config = makeConfig([]);
        const provider = new Provider(config);

        await provider.translate(['ru/index.md'], config);

        expect(request).toHaveBeenCalled();

        const [{data}] = request.mock.calls[0];

        expect(data.glossaryConfig).toBeUndefined();
    });
});
