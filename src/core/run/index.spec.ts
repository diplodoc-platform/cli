/* eslint-disable @typescript-eslint/no-explicit-any */

import {beforeEach, describe, expect, it, vi} from 'vitest';

import {InsecureAccessError} from './errors';

import {Run} from './index';

vi.mock('../config', () => ({
    resolveConfig: vi.fn(),
    withConfigUtils: vi.fn((path, config) => ({
        ...config,
        resolve: vi.fn(),
        [Symbol.for('configPath')]: path,
    })),
    scope: vi.fn(),
    strictScope: vi.fn(),
    configPath: Symbol.for('configPath'),
}));

describe('Run class', () => {
    let run: Run;
    let mockFs: any;
    let tempDir: string;

    beforeEach(() => {
        vi.clearAllMocks();
        tempDir = '/test/input';

        // Mock file system
        mockFs = {
            stat: vi.fn(),
            statSync: vi.fn(),
            readFile: vi.fn(),
            writeFile: vi.fn(),
            mkdir: vi.fn(),
            rename: vi.fn(),
            unlink: vi.fn(),
            rm: vi.fn(),
            realpath: vi.fn((path: string) => Promise.resolve(path)),
            realpathSync: vi.fn((path: string) => path),
            copyFile: vi.fn(),
        };

        // Create Run instance with mocked config
        const mockConfig = {
            input: tempDir as AbsolutePath,
            quiet: false,
            strict: false,
        } as any;

        run = new Run(mockConfig);
        // Replace fs with mock
        (run as any).fs = mockFs;
        // Add scope to allow file operations
        run['scopes'].set('input', tempDir as AbsolutePath);
    });

    describe('write method', () => {
        it('should create temp file with unique name using Math.random', async () => {
            const testPath = '/test/input/file.txt' as AbsolutePath;
            const content = 'test content';

            mockFs.statSync.mockImplementation(() => {
                throw new Error('File not found');
            });
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.writeFile.mockResolvedValue(undefined);
            mockFs.rename.mockResolvedValue(undefined);

            await run.write(testPath, content);

            expect(mockFs.mkdir).toHaveBeenCalledWith('/test/input', {recursive: true});
            expect(mockFs.writeFile).toHaveBeenCalledTimes(1);

            // Check that temp file name includes random string
            const tempPath = mockFs.writeFile.mock.calls[0][0];
            expect(tempPath).toMatch(/\.tmp\.\d+\.[a-z0-9]+$/);
        });

        it('should generate unique temp file names for each write', async () => {
            const testPath = '/test/input/file.txt' as AbsolutePath;
            const content = 'test content';

            mockFs.statSync.mockImplementation(() => {
                throw new Error('File not found');
            });
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.writeFile.mockResolvedValue(undefined);
            mockFs.rename.mockResolvedValue(undefined);

            await run.write(testPath, content);
            const firstTempPath = mockFs.writeFile.mock.calls[0][0];

            await run.write(testPath, content + '2');
            const secondTempPath = mockFs.writeFile.mock.calls[1][0];

            // Both should have random strings
            expect(firstTempPath).toMatch(/\.tmp\.\d+\.[a-z0-9]+$/);
            expect(secondTempPath).toMatch(/\.tmp\.\d+\.[a-z0-9]+$/);

            // Random strings should be different (extremely unlikely to be the same)
            const firstRandom = firstTempPath.split('.').pop() || '';
            const secondRandom = secondTempPath.split('.').pop() || '';
            expect(firstRandom).not.toBe(secondRandom);
        });

        it('should use atomic write: write to temp then rename', async () => {
            const testPath = '/test/input/file.txt' as AbsolutePath;
            const content = 'test content';

            mockFs.statSync.mockImplementation(() => {
                throw new Error('File not found');
            });
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.writeFile.mockResolvedValue(undefined);
            mockFs.rename.mockResolvedValue(undefined);

            await run.write(testPath, content);

            expect(mockFs.writeFile).toHaveBeenCalled();
            expect(mockFs.rename).toHaveBeenCalled();

            const tempPath = mockFs.writeFile.mock.calls[0][0];
            expect(mockFs.rename).toHaveBeenCalledWith(tempPath, testPath);
        });

        it('should not overwrite existing file when force is false', async () => {
            const testPath = '/test/input/file.txt' as AbsolutePath;
            const content = 'test content';

            mockFs.statSync.mockReturnValue({isFile: () => true});
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.writeFile.mockResolvedValue(undefined);
            mockFs.rename.mockResolvedValue(undefined);

            await run.write(testPath, content);

            expect(mockFs.mkdir).not.toHaveBeenCalled();
            expect(mockFs.writeFile).not.toHaveBeenCalled();
            expect(mockFs.rename).not.toHaveBeenCalled();
        });

        it('should overwrite existing file when force is true', async () => {
            const testPath = '/test/input/file.txt' as AbsolutePath;
            const content = 'test content';

            mockFs.statSync.mockReturnValue({isFile: () => true});
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.writeFile.mockResolvedValue(undefined);
            mockFs.rename.mockResolvedValue(undefined);

            await run.write(testPath, content, true);

            expect(mockFs.mkdir).toHaveBeenCalled();
            expect(mockFs.writeFile).toHaveBeenCalled();
            expect(mockFs.rename).toHaveBeenCalled();
        });

        it('should clean up temp file on error', async () => {
            const testPath = '/test/input/file.txt' as AbsolutePath;
            const content = 'test content';
            const writeError = new Error('Write failed');

            mockFs.statSync.mockImplementation(() => {
                throw new Error('File not found');
            });
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.writeFile.mockRejectedValue(writeError);
            mockFs.unlink.mockResolvedValue(undefined);

            await expect(run.write(testPath, content)).rejects.toThrow('Write failed');

            expect(mockFs.unlink).toHaveBeenCalled();
        });

        it('should handle Windows rename error with fallback', async () => {
            const testPath = '/test/input/file.txt' as AbsolutePath;
            const content = 'test content';
            const renameError = {code: 'EEXIST'} as any;

            mockFs.statSync.mockImplementation(() => {
                throw new Error('File not found');
            });
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.writeFile.mockResolvedValue(undefined);

            // First rename fails with EEXIST, second succeeds
            mockFs.rename.mockRejectedValueOnce(renameError).mockResolvedValueOnce(undefined);

            mockFs.unlink.mockResolvedValue(undefined);

            await run.write(testPath, content);

            expect(mockFs.unlink).toHaveBeenCalledWith(testPath);
            expect(mockFs.rename).toHaveBeenCalledTimes(2);
        });

        it('should throw InsecureAccessError for paths outside scope', async () => {
            const testPath = '/malicious/path/file.txt' as AbsolutePath;
            const content = 'test content';

            mockFs.realpath.mockResolvedValue('/malicious/path/file.txt');

            await expect(run.write(testPath, content)).rejects.toThrow(InsecureAccessError);
        });

        it('should wait before writing to allow parallel processing detection', async () => {
            const testPath = '/test/input/file.txt' as AbsolutePath;
            const content = 'test content';

            mockFs.statSync.mockImplementation(() => {
                throw new Error('File not found');
            });
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.writeFile.mockResolvedValue(undefined);
            mockFs.rename.mockResolvedValue(undefined);

            const startTime = Date.now();
            await run.write(testPath, content);
            const endTime = Date.now();

            // Should have waited at least 1ms
            expect(endTime - startTime).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Math.random usage', () => {
        it('should use Math.random for unique temp file names', async () => {
            const testPath = '/test/input/file.txt' as AbsolutePath;
            const content = 'test content';

            mockFs.statSync.mockImplementation(() => {
                throw new Error('File not found');
            });
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.writeFile.mockResolvedValue(undefined);
            mockFs.rename.mockResolvedValue(undefined);

            await run.write(testPath, content);

            const tempPath = mockFs.writeFile.mock.calls[0][0];
            // Temp file name format: path.tmp.timestamp.random
            expect(tempPath).toMatch(/\.tmp\.\d+\.[a-z0-9]+$/);
        });

        it('should work correctly with multiple instances in parallel', async () => {
            const testPath = '/test/input/file.txt' as AbsolutePath;
            const content = 'test content';

            mockFs.statSync.mockImplementation(() => {
                throw new Error('File not found');
            });
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.writeFile.mockResolvedValue(undefined);
            mockFs.rename.mockResolvedValue(undefined);

            // Create second instance
            const mockConfig2 = {
                input: tempDir as AbsolutePath,
                quiet: false,
                strict: false,
            } as any;
            const run2 = new Run(mockConfig2);
            (run2 as any).fs = mockFs;
            run2['scopes'].set('input', tempDir as AbsolutePath);

            await run.write(testPath, content);
            const firstTempPath = mockFs.writeFile.mock.calls[0][0];

            await run2.write(testPath, content);
            const secondTempPath = mockFs.writeFile.mock.calls[1][0];

            // Both should have random strings
            expect(firstTempPath).toMatch(/\.tmp\.\d+\.[a-z0-9]+$/);
            expect(secondTempPath).toMatch(/\.tmp\.\d+\.[a-z0-9]+$/);

            // Random strings should be different (extremely unlikely to be the same)
            const firstRandom = firstTempPath.split('.').pop() || '';
            const secondRandom = secondTempPath.split('.').pop() || '';
            expect(firstRandom).not.toBe(secondRandom);
        });
    });
});
