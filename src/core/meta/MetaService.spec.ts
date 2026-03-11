import type {Meta} from './types';
import type {Run} from '~/core/run';

import {beforeEach, describe, expect, it} from 'vitest';

import {MetaService} from './MetaService';

type MockConfig = {
    rawAddMeta: boolean;
    addSystemMeta: boolean;
    addResourcesMeta: boolean;
    addMetadataMeta: boolean;
};

// Create a minimal mock that matches the Run type structure
function createMockRun(config: Partial<MockConfig> = {}) {
    const mockConfig = {
        rawAddMeta: false,
        addSystemMeta: true,
        addResourcesMeta: true,
        addMetadataMeta: true,
        ...config,
    };

    // Return a minimal mock that satisfies the Run type requirements
    return {
        config: mockConfig,
        logger: {
            topic: () => () => {},
        },
        fs: {},
        normalize: (path: string) => path,
        input: '/mock/input' as AbsolutePath,
        originalInput: '/mock/input' as AbsolutePath,
        scopes: new Map(),
        exists: () => false,
        read: async () => '',
        write: async () => {},
        glob: async () => [],
        copy: async () => [],
        remove: async () => {},
        realpath: async (path: string) => path,
        realpathSync: (path: string) => path,
    } as unknown as Run<MockConfig>;
}

describe('MetaService', () => {
    let metaService: MetaService;

    beforeEach(() => {
        metaService = new MetaService(createMockRun());
    });

    describe('set() vs add()', () => {
        it('set() overwrites all existing metadata', () => {
            const file = 'test/file.md' as NormalizedPath;

            metaService.addSystemVars(file, {var1: 'value1'});
            metaService.add(file, {title: 'Title'}, false);

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

            metaService.add(file, {title: 'Title'}, false);
            metaService.add(file, {description: 'Description'}, false);
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

            metaService.add(fileA, {title: 'Page A'}, false);
            metaService.addSystemVars(fileA, {varA: 'valueA'});

            metaService.add(fileB, {title: 'Page B'}, false);
            metaService.addSystemVars(fileB, {varB: 'valueB'});

            const metaA = metaService.get(fileA);
            const metaB = metaService.get(fileB);

            expect(metaA.title).toBe('Page A');
            expect(metaA.__system).toEqual({varA: 'valueA'});

            expect(metaB.title).toBe('Page B');
            expect(metaB.__system).toEqual({varB: 'valueB'});
        });
    });

    describe('rawAddMeta functionality', () => {
        it('should replace all metadata when rawAddMeta is true and isRaw is true', () => {
            const file = 'test/file.md' as NormalizedPath;
            const metaService = new MetaService(createMockRun({rawAddMeta: true}));

            // Add initial metadata using raw mode since rawAddMeta is true
            metaService.add(
                file,
                {title: 'Initial Title', description: 'Initial Description'},
                true,
            );
            metaService.addSystemVars(file, {var1: 'value1'});

            // Verify initial state
            const initialMeta = metaService.get(file);
            expect(initialMeta.title).toBe('Initial Title');
            expect(initialMeta.description).toBe('Initial Description');
            expect(initialMeta.__system).toEqual({var1: 'value1'});

            // Add raw metadata - should replace everything
            metaService.add(file, {title: 'Raw Title'}, true);

            // Verify raw metadata replaced everything
            const rawMeta = metaService.get(file);
            expect(rawMeta.title).toBe('Raw Title');
            expect(rawMeta.description).toBeUndefined();
            expect(rawMeta.__system).toBeUndefined();
        });

        it('should do nothing when rawAddMeta is true but isRaw is false', () => {
            const file = 'test/file.md' as NormalizedPath;
            const metaService = new MetaService(createMockRun({rawAddMeta: true}));

            // Add initial metadata using raw mode since rawAddMeta is true
            metaService.add(file, {title: 'Initial Title'}, true);
            metaService.addSystemVars(file, {var1: 'value1'});

            // Verify initial state
            const initialMeta = metaService.get(file);
            expect(initialMeta.title).toBe('Initial Title');
            expect(initialMeta.__system).toEqual({var1: 'value1'});

            // Add non-raw metadata - should do nothing when rawAddMeta is true
            metaService.add(file, {description: 'New Description'}, false);

            // Verify metadata was not changed
            const unchangedMeta = metaService.get(file);
            expect(unchangedMeta.title).toBe('Initial Title');
            expect(unchangedMeta.description).toBeUndefined(); // Should not be added
            expect(unchangedMeta.__system).toEqual({var1: 'value1'});
        });

        it('should merge metadata when rawAddMeta is false regardless of isRaw', () => {
            const file = 'test/file.md' as NormalizedPath;
            const metaService = new MetaService(createMockRun({rawAddMeta: false}));

            // Add some initial metadata
            metaService.add(file, {title: 'Initial Title'}, false);
            metaService.addSystemVars(file, {var1: 'value1'});

            // Add raw metadata - should still merge since rawAddMeta is false
            metaService.add(file, {description: 'Raw Description'}, true);

            // Verify metadata was merged
            const mergedMeta = metaService.get(file);
            expect(mergedMeta.title).toBe('Initial Title');
            expect(mergedMeta.description).toBe('Raw Description');
            expect(mergedMeta.__system).toEqual({var1: 'value1'});
        });

        it('should handle default isRaw parameter (false)', () => {
            const file = 'test/file.md' as NormalizedPath;
            const metaService = new MetaService(createMockRun({rawAddMeta: false}));

            // Add some initial metadata
            metaService.add(file, {title: 'Initial Title'}, false);
            metaService.addSystemVars(file, {var1: 'value1'});

            // Add metadata without isRaw parameter (should default to false)
            metaService.add(file, {description: 'Default Description'});

            // Verify metadata was merged
            const mergedMeta = metaService.get(file);
            expect(mergedMeta.title).toBe('Initial Title');
            expect(mergedMeta.description).toBe('Default Description');
            expect(mergedMeta.__system).toEqual({var1: 'value1'});
        });
    });
});
