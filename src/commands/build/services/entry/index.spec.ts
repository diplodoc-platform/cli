import {describe, expect, it} from 'vitest';

import {EntryService} from './EntryService';

const cleanKeywords = (content: any[]) => {
    return (EntryService.prototype as any).cleanKeywords(content);
};

const createMockService = (relationsMock: any) => {
    const service = Object.create(EntryService.prototype);
    service.relations = {
        hasNode: (path: string) => Boolean(relationsMock[path]),
        getNodeData: (path: string) => relationsMock[path] || {},
    };
    return service;
};

describe('EntryService', () => {
    describe('cleanKeywords', () => {
        it('keeps and formats valid plain string items', () => {
            expect(cleanKeywords(['foo', 'bar'])).toEqual('foo, bar');
        });

        it('extracts target values from object keywords mapping cleanly', () => {
            expect(cleanKeywords([{keyword: 'Yandex'}, {keyword: 'taxi'}])).toEqual('Yandex, taxi');
            expect(cleanKeywords(['plain', {keyword: 'wrapped'}])).toEqual('plain, wrapped');
        });

        it('strips away layout template brackets and duplicate middle spaces', () => {
            expect(cleanKeywords([{keyword: '  wrapped   spacing '}, 'normal'])).toEqual(
                'wrapped spacing, normal',
            );
            expect(
                cleanKeywords([{keyword: 'Номер телефона {{yandex}}'}, 'контакт {{unknown-var}}']),
            ).toEqual('Номер телефона, контакт');
        });

        it('filters out short keywords falling below length threshold', () => {
            expect(cleanKeywords(['ok', 'sh', 'longer-word'])).toEqual('longer-word');
        });
    });

    describe('isSource / isResource graph filters', () => {
        const mockGraph = {
            'docs/file.md': {type: 'source'},
            'assets/image.png': {type: 'resource'},
            'config/data.yaml': {type: 'entry'},
        };

        it('returns false for both if path is missing from graph nodes', () => {
            const service = createMockService(mockGraph);
            expect(service.isSource('docs/unknown.md')).toEqual(false);
            expect(service.isResource('docs/unknown.md')).toEqual(false);
        });

        it('correctly maps and evaluates type: source paths', () => {
            const service = createMockService(mockGraph);
            expect(service.isSource('docs/file.md')).toEqual(true);
            expect(service.isResource('docs/file.md')).toEqual(false);
        });

        it('correctly maps and evaluates type: resource paths', () => {
            const service = createMockService(mockGraph);
            expect(service.isSource('assets/image.png')).toEqual(false);
            expect(service.isResource('assets/image.png')).toEqual(true);
        });

        it('returns false for other internal node types like entry', () => {
            const service = createMockService(mockGraph);
            expect(service.isSource('config/data.yaml')).toEqual(false);
            expect(service.isResource('config/data.yaml')).toEqual(false);
        });
    });
});
