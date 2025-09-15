import {afterEach, describe, expect, it, vi} from 'vitest';
import {when} from 'vitest-when';

import {execa} from 'execa';
import {dedent} from 'ts-dedent';

import {ArcClient} from './arc-client';

const baseDir = __dirname;

// Mock at module level
vi.mock('execa', () => ({
    execa: vi.fn(),
}));

// Helper functions for data preparation
function createClientWithSampleData(sample: string, config: any = {vcs: {}}) {
    vi.mocked(execa).mockResolvedValue({stdout: sample} as any);
    return new ArcClient(config, baseDir);
}

// Common test data
const BASIC_COMMIT_SAMPLE = dedent`
    commit abcdef1234567890
    author: login1
    date: 2025-01-01T00:00:00Z
    revision: 1

        Message line

    A   file1.md
    D   file2.yaml

`;

const MULTIPLE_COMMITS_SAMPLE = dedent`
    commit commit3
    author: author3
    date: 2025-01-03T00:00:00Z
    revision: 3

        Third commit

    M   file1.md

    commit commit2
    author: author2
    date: 2025-01-02T00:00:00Z
    revision: 2

        Second commit

    A   file1.md

    commit commit1
    author: author1
    date: 2025-01-01T00:00:00Z
    revision: 1

        First commit

    A   file0.md

`;

const RENAME_SAMPLE = dedent`
    commit rename_commit
    author: renamer
    date: 2025-01-02T00:00:00Z
    revision: 2

        Rename file

    R   old_file.md   new_file.md

    commit create_commit
    author: creator
    date: 2025-01-01T00:00:00Z
    revision: 1

        Create file

    A   old_file.md

`;

const DELETE_SAMPLE = dedent`
    commit delete_commit
    author: deleter
    date: 2025-01-02T00:00:00Z
    revision: 2

        Delete file

    D   file_to_delete.md

    commit create_commit
    author: creator
    date: 2025-01-01T00:00:00Z
    revision: 1

        Create files

    A   file_to_delete.md
    A   file0.md

`;

const INITIAL_COMMIT_SAMPLE = dedent`
    commit commit3
    author: author3
    date: 2025-01-03T00:00:00Z
    revision: 3

        Third commit

    A   file1.md

    commit commit2
    author: author2
    date: 2025-01-02T00:00:00Z
    revision: 2

        Second commit

    A   file2.md

    commit commit1
    author: author1
    date: 2025-01-01T00:00:00Z
    revision: 1

        First commit

    A   file0.md

`;

const DELETE_WITH_INITIAL_COMMIT_SAMPLE = dedent`
    commit delete_commit
    author: deleter
    date: 2025-01-03T00:00:00Z
    revision: 3

        Delete file

    D   file_to_delete.md

    commit modify_commit
    author: modifier
    date: 2025-01-02T00:00:00Z
    revision: 2

        Modify file

    A   file_to_delete.md
    A   file0.md

    commit create_commit
    author: creator
    date: 2025-01-01T00:00:00Z
    revision: 1

        Create file

    A   file1.md

`;

function arc(args: string[], options?: object) {
    const mocked = vi.mocked(execa);
    if (options) {
        // @ts-ignore
        return when(mocked).calledWith('arc', args, options);
    } else {
        // @ts-ignore
        return when(mocked).calledWith('arc', args);
    }
}

describe('ArcClient', () => {
    afterEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('should parse authors from arc CLI', async () => {
        const client = createClientWithSampleData(BASIC_COMMIT_SAMPLE);

        const authors = await client.getAuthors();
        expect(authors).toEqual({
            'file1.md': {
                login: 'login1',
                commit: 'abcdef1234567890',
            },
        });
    });

    it('should parse contributors', async () => {
        const client = createClientWithSampleData(BASIC_COMMIT_SAMPLE);

        const contributors = await client.getContributors();
        expect(contributors).toEqual({
            'file1.md': [
                {
                    login: 'login1',
                    commit: 'abcdef1234567890',
                },
            ],
        });
    });

    it('should parse mtimes as unix timestamps', async () => {
        const client = createClientWithSampleData(BASIC_COMMIT_SAMPLE);

        const mtimes = await client.getMTimes();
        expect(mtimes).toEqual({
            'file1.md': Math.floor(new Date('2025-01-01T00:00:00Z').getTime() / 1000),
        });
    });

    it('should handle multiple commits for authors', async () => {
        const client = createClientWithSampleData(MULTIPLE_COMMITS_SAMPLE);

        const authors = await client.getAuthors();

        // Check full structure: both files with correct authors
        expect(authors).toEqual({
            'file1.md': {
                login: 'author2',
                commit: 'commit2',
            },
            'file0.md': {
                login: 'author1',
                commit: 'commit1',
            },
        });
    });

    it('should handle multiple commits for contributors', async () => {
        const client = createClientWithSampleData(MULTIPLE_COMMITS_SAMPLE);

        const contributors = await client.getContributors();

        // Check full structure: both files with correct contributors
        expect(contributors).toEqual({
            'file1.md': [
                {login: 'author2', commit: 'commit2'},
                {login: 'author3', commit: 'commit3'},
            ],
            'file0.md': [{login: 'author1', commit: 'commit1'}],
        });
    });

    it('should handle file rename correctly for authors', async () => {
        const client = createClientWithSampleData(RENAME_SAMPLE);

        const authors = await client.getAuthors();

        // Check full structure: old file removed, new file has correct author
        expect(authors).toEqual({
            'new_file.md': {
                login: 'renamer',
                commit: 'rename_commit',
            },
        });
    });

    it('should handle file rename correctly for contributors', async () => {
        const client = createClientWithSampleData(RENAME_SAMPLE);

        const contributors = await client.getContributors();

        // Check full structure: old file removed, new file has both contributors
        expect(contributors).toEqual({
            'new_file.md': [
                {login: 'creator', commit: 'create_commit'},
                {login: 'renamer', commit: 'rename_commit'},
            ],
        });
    });

    it('should handle file deletion correctly', async () => {
        const client = createClientWithSampleData(DELETE_SAMPLE);

        const authors = await client.getAuthors();
        const contributors = await client.getContributors();

        // Check full structure: deleted file absent, existing file present
        expect(authors).toEqual({
            'file0.md': {
                login: 'creator',
                commit: 'create_commit',
            },
        });
        expect(contributors).toEqual({
            'file0.md': [
                {
                    login: 'creator',
                    commit: 'create_commit',
                },
            ],
        });
    });

    it('should respect initialCommit for authors', async () => {
        const client = createClientWithSampleData(MULTIPLE_COMMITS_SAMPLE, {
            vcs: {initialCommit: 'commit2'},
        });

        const authors = await client.getAuthors();
        // Author should be the one who created the file within limited history (commit2)
        expect(authors['file1.md']).toEqual({
            login: 'author2',
            commit: 'commit2',
        });
    });

    it('should respect initialCommit for contributors', async () => {
        const client = createClientWithSampleData(MULTIPLE_COMMITS_SAMPLE, {
            vcs: {initialCommit: 'commit2'},
        });

        const contributors = await client.getContributors();

        // Check full structure: only contributors from remaining commits
        expect(contributors).toEqual({
            'file1.md': [
                {login: 'author2', commit: 'commit2'},
                {login: 'author3', commit: 'commit3'},
            ],
        });
    });

    it('should respect initialCommit for mtimes', async () => {
        const client = createClientWithSampleData(MULTIPLE_COMMITS_SAMPLE, {
            vcs: {initialCommit: 'commit2'},
        });

        const mtimes = await client.getMTimes();

        // Modification time should be from commit3 (last commit in limited history)
        const expectedTime = Math.floor(new Date('2025-01-03T00:00:00Z').getTime() / 1000);
        expect(mtimes['file1.md']).toBe(expectedTime);
    });

    it('should handle initialCommit with partial commit hash', async () => {
        const client = createClientWithSampleData(BASIC_COMMIT_SAMPLE, {
            vcs: {initialCommit: 'abcdef'},
        });

        const authors = await client.getAuthors();
        expect(authors['file1.md']).toEqual({
            login: 'login1',
            commit: 'abcdef1234567890',
        });
    });

    it('should handle initialCommit not found', async () => {
        const client = createClientWithSampleData(MULTIPLE_COMMITS_SAMPLE, {
            vcs: {initialCommit: 'nonexistent'},
        });

        const authors = await client.getAuthors();
        // If initialCommit not found, should process all commits
        expect(authors).toEqual({
            'file1.md': {
                login: 'author2',
                commit: 'commit2',
            },
            'file0.md': {
                login: 'author1',
                commit: 'commit1',
            },
        });
    });

    it('should handle initialCommit at the beginning of log', async () => {
        const client = createClientWithSampleData(INITIAL_COMMIT_SAMPLE, {
            vcs: {initialCommit: 'commit3'},
        });

        const authors = await client.getAuthors();
        // Should remain only commit3
        expect(authors['file1.md']).toEqual({
            login: 'author3',
            commit: 'commit3',
        }); // File modifier in commit3
        expect(authors['file0.md']).toBeUndefined(); // File from commit1 excluded
    });

    it('should handle file deletion with initialCommit', async () => {
        const client = createClientWithSampleData(DELETE_WITH_INITIAL_COMMIT_SAMPLE, {
            vcs: {initialCommit: 'modify_commit'},
        });

        const authors = await client.getAuthors();
        // File should not exist because it's created in modify_commit (commit2),
        // but then deleted in delete_commit (commit3), which is processed first
        expect(authors['file_to_delete.md']).toBeUndefined();

        // file0.md should exist because it's created in modify_commit (commit2)
        // and not deleted in subsequent commits
        expect(authors['file0.md']).toEqual({
            login: 'modifier',
            commit: 'modify_commit',
        });
    });

    it('should handle empty log with initialCommit', async () => {
        const client = createClientWithSampleData('', {vcs: {initialCommit: 'commit1'}});

        const authors = await client.getAuthors();
        const contributors = await client.getContributors();
        const mtimes = await client.getMTimes();

        expect(authors).toEqual({});
        expect(contributors).toEqual({});
        expect(mtimes).toEqual({});
    });

    it('should ignore authors by pattern', async () => {
        const client = createClientWithSampleData(MULTIPLE_COMMITS_SAMPLE, {
            vcs: {},
            authors: {ignore: ['author2']},
        });

        const authors = await client.getAuthors();

        // author2 should be ignored, only author1 and author3 should remain
        expect(authors).toEqual({
            'file0.md': {
                login: 'author1',
                commit: 'commit1',
            },
        });
    });

    it('should ignore contributors by pattern', async () => {
        const client = createClientWithSampleData(MULTIPLE_COMMITS_SAMPLE, {
            vcs: {},
            contributors: {ignore: ['author3']},
        });

        const contributors = await client.getContributors();

        // author3 should be ignored from file1.md contributors
        expect(contributors).toEqual({
            'file1.md': [{login: 'author2', commit: 'commit2'}],
            'file0.md': [{login: 'author1', commit: 'commit1'}],
        });
    });

    it('should ignore multiple patterns', async () => {
        const client = createClientWithSampleData(MULTIPLE_COMMITS_SAMPLE, {
            vcs: {},
            authors: {ignore: ['author*']},
            contributors: {ignore: ['author1', 'author3']},
        });

        const authors = await client.getAuthors();
        const contributors = await client.getContributors();

        // All authors should be ignored due to wildcard pattern
        expect(authors).toEqual({});

        // Only author2 should remain in contributors
        expect(contributors).toEqual({
            'file1.md': [{login: 'author2', commit: 'commit2'}],
        });
    });

    it('should pass initialCommit range to arc log', async () => {
        const mocked = vi.mocked(execa);

        arc(['root']).thenResolve({stdout: baseDir} as any);
        arc(['log', '-n1', '--oneline'], expect.anything()).thenResolve({
            stdout: 'commit3 some message',
        } as any);
        arc(['log', '--name-status', 'commit3..commit2', '.'], expect.anything()).thenResolve({
            stdout: MULTIPLE_COMMITS_SAMPLE,
        } as any);

        const client = new ArcClient({vcs: {initialCommit: 'commit2', scopes: []}}, baseDir);
        await client.getAuthors();

        const calls = mocked.mock.calls;
        const logCall = calls.find(
            ([cmd, argv]) =>
                cmd === 'arc' &&
                Array.isArray(argv) &&
                argv[0] === 'log' &&
                argv.includes('--name-status'),
        );
        expect(logCall).toBeTruthy();
        const [, argv] = logCall as [string, string[]];
        expect(argv).toEqual(expect.arrayContaining(['commit3..commit2']));
    });

    it('should include scopes when calling arc log', async () => {
        const mocked = vi.mocked(execa);

        arc(['root']).thenResolve({stdout: baseDir} as any);
        arc(['log', '-n1', '--oneline'], expect.anything()).thenResolve({
            stdout: 'commit3 msg',
        } as any);
        arc(['log', '--name-status', 'commit3..commit2', '.'], expect.anything()).thenResolve({
            stdout: MULTIPLE_COMMITS_SAMPLE,
        } as any);
        arc(['log', '--name-status', 'commit3..commit2', 'docs'], expect.anything()).thenResolve({
            stdout: MULTIPLE_COMMITS_SAMPLE,
        } as any);

        const client = new ArcClient({vcs: {initialCommit: 'commit2', scopes: ['docs']}}, baseDir);
        await client.getAuthors();

        const calls = mocked.mock.calls.filter(
            ([cmd, argv]) =>
                cmd === 'arc' &&
                Array.isArray(argv) &&
                argv[0] === 'log' &&
                argv.includes('--name-status'),
        ) as Array<[string, string[]]>;
        expect(calls.length).toBe(2);

        const argsList = calls.map(([, argv]) => argv);
        const hasBaseScope = argsList.some(
            (argv) =>
                argv.includes('.') ||
                argv.some((a) => typeof a === 'string' && a.includes('arcadia-vcs')),
        );
        const hasDocsScope = argsList.some((argv) => argv.includes('docs'));
        expect(hasBaseScope).toBe(true);
        expect(hasDocsScope).toBe(true);
    });
});
