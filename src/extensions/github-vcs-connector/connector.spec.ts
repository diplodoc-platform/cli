import type {Mock, Mocked} from 'vitest';
import type {Run} from '@diplodoc/cli/lib/run';
import type {Config as GithubVcsConfig} from './types';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {when} from 'vitest-when';
import {setupRun} from '@diplodoc/cli/lib/test';

import {GithubVcsConnector} from './connector';
import {GitClient} from './git-client';
import {GithubClient} from './github-client';

vi.mock('./git-client');
vi.mock('./github-client');

type VcsRun = Run<GithubVcsConfig>;

const commit = (name?: string, login?: string) => ({
    commit: {
        author: name
            ? {
                  name,
                  email: `${login}@email.net`,
              }
            : null,
    },
    author: login
        ? {
              login,
              avatar_url: `https://avatar.github.com/${login}`,
              html_url: `https://github.com/${login}`,
          }
        : null,
});

describe('GithubVcsConnector', () => {
    let run: VcsRun;
    let connector: GithubVcsConnector;
    let git: Mocked<GitClient>;
    let github: Mocked<GithubClient>;
    let cleanup: Mocked<() => Promise<void>>;

    beforeEach(() => {
        (GitClient as Mock).mockImplementationOnce(function (config: GithubVcsConfig) {
            git = new GitClient(config) as Mocked<GitClient>;
            return git;
        });
        (GithubClient as Mock).mockImplementationOnce((config: GithubVcsConfig) => {
            github = new GithubClient(config) as Mocked<GithubClient>;
            return github;
        });

        const config: GithubVcsConfig = {
            ignoreAuthorPatterns: [],
            vcs: {
                owner: 'diplodoc-platform',
                repo: 'cli',
                token: 'token',
                endpoint: 'endpoint',
                initialCommit: '',
            },
        };

        run = setupRun(config);
        cleanup = vi.fn(async () => {});
        connector = new GithubVcsConnector(run);

        git.createMasterWorktree.mockResolvedValue(cleanup);
        git.getMTimes.mockResolvedValue({});
        git.getAuthors.mockResolvedValue({});
        git.getContributors.mockResolvedValue({});
        github.getCommitInfo.mockResolvedValue(commit());
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('authors', () => {
        it('should resolve author', async () => {
            const path = 'some/path.md' as NormalizedPath;

            when(git.getAuthors)
                .calledWith('/dev/null/input/_yfm-master')
                .thenResolve({[path]: 'sha-1'});
            when(github.getCommitInfo).calledWith('sha-1').thenResolve(commit('Test User', 'user'));

            await connector.init();

            const author = await connector.getAuthorByPath(path);

            expect(author).toEqual({
                avatar: `https://avatar.github.com/user`,
                email: 'user@email.net',
                login: 'user',
                name: 'Test User',
                url: `https://github.com/user`,
            });
        });

        it('should normalize author path', async () => {
            const path = 'some/path.md' as RelativePath;

            when(git.getAuthors)
                .calledWith('/dev/null/input/_yfm-master')
                .thenResolve({[path]: 'sha-1'});
            when(github.getCommitInfo).calledWith('sha-1').thenResolve(commit('Test User', 'user'));

            await connector.init();

            const author = await connector.getAuthorByPath(`./${path}`);

            expect(author).toEqual({
                avatar: `https://avatar.github.com/user`,
                email: 'user@email.net',
                login: 'user',
                name: 'Test User',
                url: `https://github.com/user`,
            });
        });

        it('should skip unresolved authors', async () => {
            const path = 'some/path.md' as RelativePath;

            when(git.getAuthors)
                .calledWith('/dev/null/input/_yfm-master')
                .thenResolve({[path]: 'sha-1'});
            when(github.getCommitInfo).calledWith('sha-1').thenReject(new Error('test'));

            await connector.init();

            const author = await connector.getAuthorByPath(path);

            expect(author).toBe(null);
        });

        it('should memoize github calls', async () => {
            const path1 = 'some/path1.md' as RelativePath;
            const path2 = 'some/path2.md' as RelativePath;

            when(git.getAuthors)
                .calledWith('/dev/null/input/_yfm-master')
                .thenResolve({
                    [path1]: 'sha-1',
                    [path2]: 'sha-1',
                });
            when(github.getCommitInfo).calledWith('sha-1').thenReject(commit('Test User', 'user'));

            await connector.init();

            expect(github.getCommitInfo).toBeCalledTimes(1);
        });
    });

    it('should cleanup fs after run', async () => {
        await connector.init();

        expect(cleanup).toHaveBeenCalled();
    });
});
