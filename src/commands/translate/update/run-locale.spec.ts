import {afterEach, expect, it, vi} from 'vitest';

import * as translation from '../utils/translate';

import {runUpdate} from './run';

afterEach(() => vi.restoreAllMocks());

it('prechecks changed fragments with the provider extraction settings', async () => {
    const extract = vi.spyOn(translation, 'extract');
    const result = await runUpdate(
        {
            entry: {
                kind: 'update',
                sourcePath: 'ru/a.md',
                targetPath: 'en/a.md',
                sourceBeforePath: 'b',
                sourceAfterPath: 'a',
                targetBeforePath: 't',
            },
            sourceBefore: 'Старое `setting`.',
            sourceAfter: 'Новое `setting`.',
            targetBefore: 'Old `setting`.',
        },
        async () => ({text: 'New `setting`.', diagnostics: []}),
        {
            source: {language: 'ru', locale: 'KZ'},
            target: {language: 'en', locale: 'GB'},
            code: 'all',
        },
    );
    expect(result.applied).toBe(1);
    expect(extract).toHaveBeenCalledTimes(2);
    for (const [, options] of extract.mock.calls) {
        expect(options).toMatchObject({
            code: 'all',
            source: {language: 'ru', locale: 'KZ'},
            target: {language: 'en', locale: 'GB'},
        });
    }
});
