import type {SimpleGitFactory} from 'simple-git';

import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {when} from 'vitest-when';
import simpleGit from 'simple-git';

import {GitClient} from './git-client';

const mtimes = readFileSync(join(__dirname, '__tests__/mocks/mtimes.txt'), 'utf8');
const authors = readFileSync(join(__dirname, '__tests__/mocks/authors.txt'), 'utf8');
const contributors = readFileSync(join(__dirname, '__tests__/mocks/contributors.txt'), 'utf8');

vi.mock('simple-git');

describe('GitClient', () => {
    let git: GitClient;

    const baseDir = '/test';
    const raw = vi.fn();

    beforeEach(() => {
        when(simpleGit)
            .calledWith({baseDir})
            .thenReturn({raw} as unknown as ReturnType<SimpleGitFactory>);
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should fill mtimes', async () => {
        const args = [
            'log',
            '--reverse',
            '--before=now',
            '--diff-filter=ADMR',
            '--pretty=format:%ct',
            '--name-status',
        ];

        when(raw)
            .calledWith(...args)
            .thenResolve(mtimes);

        git = new GitClient({ignoreAuthorPatterns: [], vcs: {initialCommit: ''}});

        const result = await git.getMTimes(baseDir);

        expect(result).toEqual({
            'md1.md': 1585842486,
            'md2.md': 1585842486,
            'md3.md': 1585842486,
            'md4.md': 1585842486,
            'md7.md': 1585842486,
            'md8.md': 1585137842,
            'md9.md': 1585222371,
            'index.yaml': 1585842486,
            'text.yaml': 1585842486,
        });
    });

    it('should fill authors', async () => {
        const args = [
            'log',
            `sha-1..HEAD`,
            '--diff-filter=A',
            '--pretty=format:%ae;%an;%H',
            '--name-only',
        ];

        when(raw)
            .calledWith(...args)
            .thenResolve(authors);

        git = new GitClient({ignoreAuthorPatterns: [], vcs: {initialCommit: 'sha-1'}});

        const result = await git.getAuthors(baseDir);

        expect(result).toEqual({
            'md1.md': 'sha-1',
            'md2.md': 'sha-2',
            'md3.md': 'sha-3',
            'md4.md': 'sha-4',
            'md5.md': 'sha-5',
            'index.yaml': 'sha-3',
            'test.yaml': 'sha-4',
        });
    });

    it('should filter authors by name', async () => {
        const args = [
            'log',
            `sha-1..HEAD`,
            '--diff-filter=A',
            '--pretty=format:%ae;%an;%H',
            '--name-only',
        ];

        when(raw)
            .calledWith(...args)
            .thenResolve(authors);

        git = new GitClient({
            ignoreAuthorPatterns: ['user2'],
            vcs: {initialCommit: 'sha-1'},
        });

        const result = await git.getAuthors(baseDir);

        expect(result).toEqual({
            'md1.md': 'sha-1',
            'md3.md': 'sha-3',
            'md4.md': 'sha-4',
            'md5.md': 'sha-5',
            'index.yaml': 'sha-3',
            'test.yaml': 'sha-4',
        });
    });

    it('should filter authors by email', async () => {
        const args = [
            'log',
            `sha-1..HEAD`,
            '--diff-filter=A',
            '--pretty=format:%ae;%an;%H',
            '--name-only',
        ];

        when(raw)
            .calledWith(...args)
            .thenResolve(authors);

        git = new GitClient({
            ignoreAuthorPatterns: ['user2@email.net'],
            vcs: {initialCommit: 'sha-1'},
        });

        const result = await git.getAuthors(baseDir);

        expect(result).toEqual({
            'md1.md': 'sha-1',
            'md3.md': 'sha-3',
            'md4.md': 'sha-4',
            'md5.md': 'sha-5',
            'index.yaml': 'sha-3',
            'test.yaml': 'sha-4',
        });
    });

    it('should fill contributors', async () => {
        const args = ['log', `sha-1..HEAD`, '--pretty=format:%ae;%an;%H', '--name-only'];

        when(raw)
            .calledWith(...args)
            .thenResolve(contributors);

        git = new GitClient({ignoreAuthorPatterns: [], vcs: {initialCommit: 'sha-1'}});

        const result = await git.getContributors(baseDir);

        expect(result).toEqual({
            'md1.md': ['sha-1'],
            'md2.md': ['sha-2'],
            'md3.md': ['sha-3'],
            'md4.md': ['sha-1', 'sha-4'],
            'md5.md': ['sha-5'],
            'index.yaml': ['sha-3'],
            'test.yaml': ['sha-4'],
        });
    });

    it('should filter contributors by name', async () => {
        const args = ['log', `sha-1..HEAD`, '--pretty=format:%ae;%an;%H', '--name-only'];

        when(raw)
            .calledWith(...args)
            .thenResolve(contributors);

        git = new GitClient({ignoreAuthorPatterns: ['user2'], vcs: {initialCommit: 'sha-1'}});

        const result = await git.getContributors(baseDir);

        expect(result).toEqual({
            'md3.md': ['sha-3'],
            'md4.md': ['sha-4'],
            'md5.md': ['sha-5'],
            'index.yaml': ['sha-3'],
            'test.yaml': ['sha-4'],
        });
    });

    it('should filter contributors by email', async () => {
        const args = ['log', `sha-1..HEAD`, '--pretty=format:%ae;%an;%H', '--name-only'];

        when(raw)
            .calledWith(...args)
            .thenResolve(contributors);

        git = new GitClient({
            ignoreAuthorPatterns: ['user2@email.net'],
            vcs: {initialCommit: 'sha-1'},
        });

        const result = await git.getContributors(baseDir);

        expect(result).toEqual({
            'md3.md': ['sha-3'],
            'md4.md': ['sha-4'],
            'md5.md': ['sha-5'],
            'index.yaml': ['sha-3'],
            'test.yaml': ['sha-4'],
        });
    });

    it('should fork to isolated worktree and cleanup', async () => {
        const branch = 'test-branch';
        const dir = 'test-dir' as RelativePath;

        git = new GitClient({ignoreAuthorPatterns: [], vcs: {initialCommit: 'sha-1'}});

        const cleanup = await git.createMasterWorktree(baseDir, dir, branch);

        expect(raw).toBeCalledWith(
            'worktree',
            'add',
            '-b',
            'test-branch',
            'test-dir',
            'origin/master',
        );

        await cleanup();

        expect(raw).toBeCalledWith('worktree', 'remove', 'test-dir');
        expect(raw).toBeCalledWith('branch', '-d', 'test-branch');
    });
});
