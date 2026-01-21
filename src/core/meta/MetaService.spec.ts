import type {Meta} from './types';

import {beforeEach, describe, expect, it} from 'vitest';

import {MetaService} from './MetaService';

type MockConfig = {
    rawAddMeta: boolean;
    addSystemMeta: boolean;
    addResourcesMeta: boolean;
    addMetadataMeta: boolean;
};

type MockRun = {
    config: MockConfig;
};

function createMockRun(config: Partial<MockConfig> = {}): MockRun {
    return {
        config: {
            rawAddMeta: false,
            addSystemMeta: true,
            addResourcesMeta: true,
            addMetadataMeta: true,
            ...config,
        },
    };
}

describe('MetaService', () => {
    let metaService: MetaService;

    beforeEach(() => {
        // @ts-expect-error - using minimal mock for testing
        metaService = new MetaService(createMockRun());
    });

    describe('set() vs add()', () => {
        it('set() overwrites all existing metadata', () => {
            const file = 'test/file.md' as NormalizedPath;

            metaService.addSystemVars(file, {var1: 'value1'});
            metaService.add(file, {title: 'Title'});

            expect(metaService.get(file).__system).toBeDefined();
            expect(metaService.get(file).title).toBe('Title');

            // set() replaces everything
            const newMeta: Meta = {
                metadata: [],
                alternate: [],
                style: [],
                script: [],
                csp: [],
            };
            metaService.set(file, newMeta);

            expect(metaService.get(file).__system).toBeUndefined();
            expect(metaService.get(file).title).toBeUndefined();
        });

        it('add() merges metadata', () => {
            const file = 'test/file.md' as NormalizedPath;

            metaService.add(file, {title: 'Title'});
            metaService.add(file, {description: 'Description'});
            metaService.addSystemVars(file, {var1: 'value1'});
            metaService.addSystemVars(file, {var2: 'value2'});

            const meta = metaService.get(file);
            expect(meta.title).toBe('Title');
            expect(meta.description).toBe('Description');
            expect(meta.__system).toEqual({var1: 'value1', var2: 'value2'});
        });
    });

    describe('addSystemVars()', () => {
        it('should add __system vars', () => {
            const file = 'en/test/page.md' as NormalizedPath;

            metaService.addSystemVars(file, {testVar: 'test-value'});

            const meta = metaService.get(file);
            expect(meta.__system).toEqual({testVar: 'test-value'});
        });

        it('should merge multiple addSystemVars() calls', () => {
            const file = 'en/test/page.md' as NormalizedPath;

            metaService.addSystemVars(file, {var1: 'value1'});
            metaService.addSystemVars(file, {var2: 'value2'});

            const meta = metaService.get(file);
            expect(meta.__system).toEqual({var1: 'value1', var2: 'value2'});
        });
    });

    describe('metadata independence', () => {
        it('should not mix metadata between different files', () => {
            const fileA = 'en/docs/page-a.md' as NormalizedPath;
            const fileB = 'en/docs/page-b.md' as NormalizedPath;

            metaService.add(fileA, {title: 'Page A'});
            metaService.addSystemVars(fileA, {varA: 'valueA'});

            metaService.add(fileB, {title: 'Page B'});
            metaService.addSystemVars(fileB, {varB: 'valueB'});

            const metaA = metaService.get(fileA);
            const metaB = metaService.get(fileB);

            expect(metaA.title).toBe('Page A');
            expect(metaA.__system).toEqual({varA: 'valueA'});

            expect(metaB.title).toBe('Page B');
            expect(metaB.__system).toEqual({varB: 'valueB'});
        });
    });
});
