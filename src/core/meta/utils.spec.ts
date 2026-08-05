import {describe, expect, it} from 'vitest';

import {getPublicMeta, getPublicState} from './utils';

describe('getPublicMeta', () => {
    it('keeps regular tags and removes technical tags', () => {
        const meta = {
            title: 'Page',
            tags: ['info', '_internal', 'syntax'],
        };

        expect(getPublicMeta(meta)).toEqual({
            title: 'Page',
            tags: ['info', 'syntax'],
        });
        expect(meta.tags).toEqual(['info', '_internal', 'syntax']);
    });

    it('removes tags field when it contains only technical tags', () => {
        expect(getPublicMeta({tags: ['_internal']})).toEqual({});
    });

    it('returns metadata without tags unchanged', () => {
        expect(getPublicMeta({title: 'Page'})).toEqual({title: 'Page'});
    });
});

describe('getPublicState', () => {
    it('filters technical tags without changing the source state metadata', () => {
        const state = {
            data: {
                title: 'Page',
                meta: {
                    tags: ['info', '_internal', 'syntax'],
                },
            },
            lang: 'en',
        };

        expect(getPublicState(state)).toEqual({
            data: {
                title: 'Page',
                meta: {
                    tags: ['info', 'syntax'],
                },
            },
            lang: 'en',
        });
        expect(state.data.meta.tags).toEqual(['info', '_internal', 'syntax']);
    });
});
