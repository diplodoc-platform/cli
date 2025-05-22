import type {Mock, Mocked} from 'vitest';
import type {Run} from '@diplodoc/cli/lib/run';
import type {Contributor} from '@diplodoc/cli/lib/vcs';
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

const commit = (name?: string, login?: string) => [
    {
        oid: 'sha-1',
        author: {
            user: {
                login: login || '',
                name: name || '',
                email: `${login}@email.net`,
                avatar: `https://avatar.github.com/${login}`,
                url: `https://github.com/${login}`,
            },
        },
    },
];

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
            mtimes: {enabled: true},
            authors: {enabled: true, ignore: []},
            contributors: {enabled: true, ignore: []},
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
        github.getCommitsInfo.mockResolvedValue([]);
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('authors', () => {
        it('should resolve author', async () => {
            const path = 'some/path.md' as NormalizedPath;

            when(git.getAuthors)
                .calledWith('/dev/null/input/_yfm-master')
                .thenResolve({[path]: {email: 'user@email.net', commit: 'sha-1'}});
            when(github.getCommitsInfo)
                .calledWith(['sha-1'])
                .thenResolve(commit('Test User', 'user'));

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
                .thenResolve({[path]: {email: 'user@email.net', commit: 'sha-1'}});
            when(github.getCommitsInfo)
                .calledWith(['sha-1'])
                .thenResolve(commit('Test User', 'user'));

            await connector.init();

            const author = (await connector.getAuthorByPath(`./${path}`)) as Contributor;

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
                .thenResolve({[path]: {email: 'user@email.net', commit: 'sha-1'}});
            when(github.getCommitsInfo).calledWith(['sha-1']).thenResolve([]);

            await connector.init();

            const author = await connector.getAuthorByPath(path);

            expect(author).toBe(null);
        });
    });

    it('should cleanup fs after run', async () => {
        await connector.init();

        expect(cleanup).toHaveBeenCalled();
    });
});
