import type {EntryInfo} from '~/commands/build';

import {describe, expect, it} from 'vitest';

import {createDocument} from './documents';

describe('search documents', () => {
    it('converts rendered title markup and entities into searchable text', () => {
        const document = createDocument(
            'en/guide.md',
            'en',
            {
                title: 'Hello <strong>world</strong> &amp; friends',
                html: '<p>Body</p>',
                meta: {},
            } as EntryInfo,
            false,
        );
        expect(document?.title).toBe('Hello world & friends');
        expect(document?.headings).toEqual(['Hello world & friends']);
    });

    it('extracts prose, preserves block boundaries and ignores scripts', () => {
        const document = createDocument(
            'en/guide.md',
            'en',
            {
                title: 'Guide',
                html: '<h1>Guide</h1><p>First &amp; second</p><p>Next</p><script>secret()</script>',
                meta: {tags: ['guide', '_private'], keywords: ['help']},
            } as EntryInfo,
            false,
        );
        expect(document).toMatchObject({
            path: 'en/guide.md',
            url: 'en/guide.html',
            content: 'Guide\nFirst & second\nNext',
            headings: ['Guide'],
            tags: ['guide'],
            keywords: ['help'],
        });
        expect(document?.id).toMatch(/^[a-f0-9]{64}$/);
    });

    it.each([{noIndex: true}, {'docs-viewer': {noIndex: true}}])(
        'excludes non-indexable metadata %j',
        (meta) => {
            expect(
                createDocument(
                    'en/private.md',
                    'en',
                    {html: '<p>Secret</p>', meta} as EntryInfo,
                    false,
                ),
            ).toBeUndefined();
        },
    );

    it('normalizes Windows paths and pretty index links with stable IDs', () => {
        const info = {title: 'Guide', html: '<p>Body</p>', meta: {}} as EntryInfo;
        const windows = createDocument('en\\guide\\index.md', 'en', info, true);
        const posix = createDocument('en/guide/index.md', 'en', info, false);
        expect(windows).toMatchObject({path: 'en/guide/index.md', url: 'en/guide/'});
        expect(windows?.id).toBe(posix?.id);
    });
});
