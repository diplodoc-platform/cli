import type {Run as BaseRun} from '~/core/run';
import type {TocService} from '~/core/toc';
import type {MetaService} from '~/core/meta';
import type {VcsConnector, Contributor, VcsMetadata} from './types';

import {describe, beforeEach, expect, it, vi} from 'vitest';

import {VcsService} from './VcsService';
import {DefaultVcsConnector} from './connector';

// Mock types for testing
type MockRun = BaseRun<any> & {
    toc: TocService;
    meta: MetaService;
};

// Type assertions for testing
const asRelativePath = (path: string) => path as RelativePath;
const asNormalizedPath = (path: string) => path as NormalizedPath;

// Mock VcsConnector for testing
class MockVcsConnector implements VcsConnector {
    getData() {
        return {
            mtimes: {},
            authors: {},
            contributors: {},
        };
    }

    setData() {}

    async getBase() {
        return asRelativePath('.');
    }

    async getContributorsByPath() {
        return [];
    }

    async getModifiedTimeByPath() {
        return null;
    }

    async getAuthorByPath() {
        return null;
    }

    async getUserByLogin() {
        return null;
    }

    async getResourcesByPath(_path: RelativePath, _meta: VcsMetadata) {
        return {};
    }
}

// Mock contributor for testing
const mockContributor: Contributor = {
    avatar: 'https://example.com/avatar.jpg',
    email: 'test@example.com',
    login: 'testuser',
    name: 'Test User',
    url: 'https://example.com/testuser',
};

describe('VcsService', () => {
    let vcsService: VcsService;
    let mockRun: MockRun;
    let mockMetaService: MetaService;
    let mockTocService: TocService;

    beforeEach(() => {
        // Create mock services
        mockMetaService = {
            get: vi.fn().mockReturnValue({}),
        } as unknown as MetaService;

        mockTocService = {} as TocService;

        // Create mock run
        mockRun = {
            config: {
                vcsPath: {enabled: true},
                mtimes: {enabled: true},
                authors: {enabled: true, ignore: []},
                contributors: {enabled: true, ignore: []},
                vcs: {enabled: true},
            },
            meta: mockMetaService,
            toc: mockTocService,
        } as unknown as MockRun;

        vcsService = new VcsService(mockRun);
    });

    describe('metadata() method', () => {
        describe('when connector is DefaultVcsConnector', () => {
            it('should NOT set author when connector is DefaultVcsConnector and author is provided', async () => {
                // Mock the connector to be DefaultVcsConnector
                vcsService['connector'] = new DefaultVcsConnector(mockRun);

                // Mock meta service to return an author
                mockMetaService.get = vi.fn().mockReturnValue({
                    author: mockContributor,
                });

                // Mock connector methods
                vi.spyOn(vcsService['connector'], 'getAuthorByPath').mockResolvedValue(mockContributor);
                vi.spyOn(vcsService['connector'], 'getContributorsByPath').mockResolvedValue([]);
                vi.spyOn(vcsService['connector'], 'getModifiedTimeByPath').mockResolvedValue(1234567890);

                const result = await vcsService.metadata(asRelativePath('test.md'));

                // Author should NOT be set when connector is DefaultVcsConnector
                expect(result.author).toBeUndefined();
                expect(result.contributors).toBeUndefined();
                expect(result.updatedAt).toBeDefined();
            });

            it('should NOT set author when connector is DefaultVcsConnector and no author is provided', async () => {
                // Mock the connector to be DefaultVcsConnector
                vcsService['connector'] = new DefaultVcsConnector(mockRun);

                // Mock meta service to return no author
                mockMetaService.get = vi.fn().mockReturnValue({});

                // Mock connector methods
                vi.spyOn(vcsService['connector'], 'getAuthorByPath').mockResolvedValue(null);
                vi.spyOn(vcsService['connector'], 'getContributorsByPath').mockResolvedValue([]);
                vi.spyOn(vcsService['connector'], 'getModifiedTimeByPath').mockResolvedValue(1234567890);

                const result = await vcsService.metadata(asRelativePath('test.md'));

                // Author should NOT be set when connector is DefaultVcsConnector
                expect(result.author).toBeUndefined();
                expect(result.contributors).toBeUndefined();
                expect(result.updatedAt).toBeDefined();
            });
        });

        describe('when connector is NOT DefaultVcsConnector', () => {
            it('should set author when connector is NOT DefaultVcsConnector and author is provided', async () => {
                // Mock the connector to be a custom connector
                vcsService['connector'] = new MockVcsConnector();

                // Mock meta service to return an author
                mockMetaService.get = vi.fn().mockReturnValue({
                    author: mockContributor,
                });

                // Mock connector methods
                vi.spyOn(vcsService['connector'], 'getAuthorByPath').mockResolvedValue(mockContributor);
                vi.spyOn(vcsService['connector'], 'getContributorsByPath').mockResolvedValue([]);
                vi.spyOn(vcsService['connector'], 'getModifiedTimeByPath').mockResolvedValue(1234567890);

                const result = await vcsService.metadata(asRelativePath('test.md'));

                // Author SHOULD be set when connector is NOT DefaultVcsConnector
                expect(result.author).toEqual(mockContributor);
                expect(result.contributors).toBeUndefined();
                expect(result.updatedAt).toBeDefined();
            });

            it('should set author when connector is NOT DefaultVcsConnector and author is retrieved from path', async () => {
                // Mock the connector to be a custom connector
                vcsService['connector'] = new MockVcsConnector();

                // Mock meta service to return no author
                mockMetaService.get = vi.fn().mockReturnValue({});

                // Mock connector methods
                vi.spyOn(vcsService['connector'], 'getAuthorByPath').mockResolvedValue(mockContributor);
                vi.spyOn(vcsService['connector'], 'getContributorsByPath').mockResolvedValue([]);
                vi.spyOn(vcsService['connector'], 'getModifiedTimeByPath').mockResolvedValue(1234567890);

                const result = await vcsService.metadata(asRelativePath('test.md'));

                // Author SHOULD be set when connector is NOT DefaultVcsConnector
                expect(result.author).toEqual(mockContributor);
                expect(result.contributors).toBeUndefined();
                expect(result.updatedAt).toBeDefined();
            });

            it('should NOT set author when connector is NOT DefaultVcsConnector but no author is available', async () => {
                // Mock the connector to be a custom connector
                vcsService['connector'] = new MockVcsConnector();

                // Mock meta service to return no author
                mockMetaService.get = vi.fn().mockReturnValue({});

                // Mock connector methods to return null for author
                vi.spyOn(vcsService['connector'], 'getAuthorByPath').mockResolvedValue(null);
                vi.spyOn(vcsService['connector'], 'getContributorsByPath').mockResolvedValue([]);
                vi.spyOn(vcsService['connector'], 'getModifiedTimeByPath').mockResolvedValue(1234567890);

                const result = await vcsService.metadata(asRelativePath('test.md'));

                // Author should NOT be set when no author is available
                expect(result.author).toBeUndefined();
                expect(result.contributors).toBeUndefined();
                expect(result.updatedAt).toBeDefined();
            });

            it('should set author to undefined when connector is NOT DefaultVcsConnector and author is falsy', async () => {
                // Mock the connector to be a custom connector
                vcsService['connector'] = new MockVcsConnector();

                // Mock meta service to return a falsy author
                mockMetaService.get = vi.fn().mockReturnValue({
                    author: null,
                });

                // Mock connector methods to return null for author
                vi.spyOn(vcsService['connector'], 'getAuthorByPath').mockResolvedValue(null);
                vi.spyOn(vcsService['connector'], 'getContributorsByPath').mockResolvedValue([]);
                vi.spyOn(vcsService['connector'], 'getModifiedTimeByPath').mockResolvedValue(1234567890);

                const result = await vcsService.metadata(asRelativePath('test.md'));

                // Author should be undefined when author is falsy
                expect(result.author).toBeUndefined();
                expect(result.contributors).toBeUndefined();
                expect(result.updatedAt).toBeDefined();
            });
        });

        it('should handle all metadata fields correctly regardless of connector type', async () => {
            // Test with custom connector
            vcsService['connector'] = new MockVcsConnector();

            const mockContributors = [mockContributor];
            // mockUpdatedAt variable removed as it was unused

            // Mock meta service
            mockMetaService.get = vi.fn().mockReturnValue({
                author: mockContributor,
            });

            // Mock connector methods
            vi.spyOn(vcsService['connector'], 'getAuthorByPath').mockResolvedValue(mockContributor);
            vi.spyOn(vcsService['connector'], 'getContributorsByPath').mockResolvedValue(mockContributors);
            vi.spyOn(vcsService['connector'], 'getModifiedTimeByPath').mockResolvedValue(1234567890);

            const result = await vcsService.metadata(asRelativePath('test.md'), [
                asNormalizedPath('dep1.md'),
                asNormalizedPath('dep2.md')
            ]);

            expect(result.author).toEqual(mockContributor);
            expect(result.contributors).toEqual(mockContributors);
            expect(result.updatedAt).toBeDefined();
        });

        it('should handle disabled config options correctly', async () => {
            // Create run with disabled options
            const disabledRun = {
                ...mockRun,
                config: {
                    vcsPath: {enabled: false},
                    mtimes: {enabled: false},
                    authors: {enabled: false, ignore: []},
                    contributors: {enabled: false, ignore: []},
                    vcs: {enabled: true},
                },
            } as MockRun;

            const disabledVcsService = new VcsService(disabledRun);
            disabledVcsService['connector'] = new MockVcsConnector();

            const result = await disabledVcsService.metadata(asRelativePath('test.md'));

            expect(result.vcsPath).toBeUndefined();
            expect(result.author).toBeUndefined();
            expect(result.contributors).toBeUndefined();
            expect(result.updatedAt).toBeUndefined();
        });
    });

    describe('connector type detection', () => {
        it('should correctly identify DefaultVcsConnector instance', () => {
            vcsService['connector'] = new DefaultVcsConnector(mockRun);
            expect(vcsService['connector'] instanceof DefaultVcsConnector).toBe(true);
        });

        it('should correctly identify non-DefaultVcsConnector instance', () => {
            vcsService['connector'] = new MockVcsConnector();
            expect(vcsService['connector'] instanceof DefaultVcsConnector).toBe(false);
        });
    });
});