import type {Graph} from '~/core/utils';

import {describe, expect, it} from 'vitest';

import {EntryService} from './EntryService';

type KeywordInput =
    | string
    | number
    | boolean
    | null
    | undefined
    | unknown[]
    | {keyword?: unknown}
    | Record<string, never>;

interface EntryServicePrivate {
    cleanKeywords(content: unknown): string[] | null;
    normalizeKeywords(meta: {keywords?: unknown}): void;
}

const getPrivate = (): EntryServicePrivate =>
    EntryService.prototype as unknown as EntryServicePrivate;

const cleanKeywords = (content: KeywordInput[] | null): string[] | null =>
    getPrivate().cleanKeywords(content);

type NodeData = {type: 'source' | 'resource' | 'entry'};
type RelationsMock = Record<string, NodeData>;

const createMockService = (relationsMock: RelationsMock): EntryService => {
    const service = Object.create(EntryService.prototype) as EntryService;

    (
        service as unknown as {relations: Pick<Graph<NodeData>, 'hasNode' | 'getNodeData'>}
    ).relations = {
        hasNode: (path: string) => Boolean(relationsMock[path]),
        getNodeData: (path: string) => relationsMock[path] ?? ({} as NodeData),
    };

    return service;
};

describe('EntryService', () => {
    describe('cleanKeywords', () => {
        it('keeps and formats valid plain string items', () => {
            expect(cleanKeywords(['foo', 'bar'])).toEqual(['foo', 'bar']);
        });

        it('extracts target values from object keywords mapping cleanly', () => {
            expect(cleanKeywords([{keyword: 'Yandex'}, {keyword: 'taxi'}])).toEqual([
                'Yandex',
                'taxi',
            ]);
            expect(cleanKeywords(['plain', {keyword: 'wrapped'}])).toEqual(['plain', 'wrapped']);
        });

        it('strips away layout template brackets and duplicate middle spaces', () => {
            expect(cleanKeywords([{keyword: '  wrapped   spacing '}, 'normal'])).toEqual([
                'wrapped spacing',
                'normal',
            ]);
            expect(
                cleanKeywords([{keyword: 'Номер телефона {{yandex}}'}, 'контакт {{unknown-var}}']),
            ).toEqual(['Номер телефона', 'контакт']);
        });

        it('converts numbers (barcodes, years) safely to strings without crashing', () => {
            expect(cleanKeywords([4670028541173, 2026])).toEqual(['4670028541173', '2026']);
            expect(cleanKeywords([{keyword: 777}, 'plain'])).toEqual(['777', 'plain']);
        });

        it('handles null, undefined and unexpected types by filtering them out', () => {
            expect(cleanKeywords([null, undefined, 'valid-word'])).toEqual(['valid-word']);
            expect(cleanKeywords([{}, {keyword: null}, 'test'])).toEqual(['test']);
        });

        it('handles booleans correctly by converting or filtering them', () => {
            expect(cleanKeywords([true, false, 'word'])).toEqual(['true', 'false', 'word']);
        });

        it('returns empty array if input content is empty or invalid', () => {
            expect(cleanKeywords([])).toEqual([]);
            expect(cleanKeywords(null)).toBeNull();
        });

        it('joins array-valued keyword field with spaces', () => {
            expect(cleanKeywords([{keyword: ['foo', 'bar', 'baz']}])).toEqual(['foo bar baz']);
        });

        it('joins a bare array element with spaces', () => {
            expect(cleanKeywords([['one', 'two'], 'plain'])).toEqual(['one two', 'plain']);
        });

        it('joins array keyword and strips unresolved vars', () => {
            expect(cleanKeywords([{keyword: ['Номер', '{{yandex}}', 'телефона']}])).toEqual([
                'Номер телефона',
            ]);
        });

        it('handles array with numbers by joining and stringifying', () => {
            expect(cleanKeywords([{keyword: ['код', 123, 456]}])).toEqual(['код 123 456']);
        });

        it('filters out empty array keyword', () => {
            expect(cleanKeywords([{keyword: []}, 'valid'])).toEqual(['valid']);
        });
    });

    describe('isSource / isResource graph filters', () => {
        const mockGraph: RelationsMock = {
            'docs/file.md': {type: 'source'},
            'assets/image.png': {type: 'resource'},
            'config/data.yaml': {type: 'entry'},
        };

        it('returns false for both if path is missing from graph nodes', () => {
            const service = createMockService(mockGraph);
            expect(service.isSource('docs/unknown.md' as never)).toBe(false);
            expect(service.isResource('docs/unknown.md' as never)).toBe(false);
        });

        it('correctly maps and evaluates type: source paths', () => {
            const service = createMockService(mockGraph);
            expect(service.isSource('docs/file.md' as never)).toBe(true);
            expect(service.isResource('docs/file.md' as never)).toBe(false);
        });

        it('correctly maps and evaluates type: resource paths', () => {
            const service = createMockService(mockGraph);
            expect(service.isSource('assets/image.png' as never)).toBe(false);
            expect(service.isResource('assets/image.png' as never)).toBe(true);
        });

        it('returns false for other internal node types like entry', () => {
            const service = createMockService(mockGraph);
            expect(service.isSource('config/data.yaml' as never)).toBe(false);
            expect(service.isResource('config/data.yaml' as never)).toBe(false);
        });
    });

    describe('normalizeKeywords', () => {
        const normalizeKeywords = (meta: {keywords?: unknown}): void =>
            getPrivate().normalizeKeywords(meta);

        it('joins array keywords into a comma-separated string', () => {
            const meta = {keywords: ['foo', 'bar', 'baz']};
            normalizeKeywords(meta);
            expect(meta.keywords).toBe('foo, bar, baz');
        });

        it('cleans object keywords and strips unresolved vars before joining', () => {
            const meta = {
                keywords: [
                    {keyword: 'Номер {{yandex}}'},
                    {keyword: 'контакт {{missing}}'},
                    'plain',
                ],
            };
            normalizeKeywords(meta);
            expect(meta.keywords).toBe('Номер, контакт, plain');
        });

        it('filters out empty results after cleaning', () => {
            const meta = {keywords: ['valid', '', null, {keyword: '{{only-var}}'}]};
            normalizeKeywords(meta);
            // '' и {{only-var}} схлопываются в пустые и отфильтровываются
            expect(meta.keywords).toBe('valid');
        });

        it('produces empty string when all keywords are empty', () => {
            const meta = {keywords: [null, undefined, '', {keyword: '{{x}}'}]};
            normalizeKeywords(meta);
            expect(meta.keywords).toBe('');
        });

        it('does nothing when keywords is not an array (string)', () => {
            const meta = {keywords: 'already a string'};
            normalizeKeywords(meta);
            expect(meta.keywords).toBe('already a string');
        });

        it('does nothing when keywords is undefined', () => {
            const meta: {keywords?: unknown} = {};
            normalizeKeywords(meta);
            expect(meta.keywords).toBeUndefined();
        });

        it('converts numeric keywords to strings', () => {
            const meta = {keywords: [123, 'text', 456]};
            normalizeKeywords(meta);
            expect(meta.keywords).toBe('123, text, 456');
        });
    });
});
