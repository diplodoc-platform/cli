import type {Run} from '@diplodoc/cli/lib/run';
import type {Contributor, VcsConnector} from '@diplodoc/cli/lib/vcs';
import type {Config} from './types';

import {join} from 'node:path';
import {dedent} from 'ts-dedent';
import {bounded, memoize, normalizePath} from '@diplodoc/cli/lib/utils';

import {GitClient} from './git-client';
import {GithubClient} from './github-client';

export type * from './types';

export class GithubVcsConnector implements VcsConnector {
    private authorByPath: Record<NormalizedPath, Contributor> = {};

    private contributorsByPath: Record<NormalizedPath, Contributor[]> = {};

    private mtimeByPath: Record<NormalizedPath, number> = {};

    private run: Run<Config>;

    private config: Config;

    private git: GitClient;

    private github: GithubClient;

    constructor(run: Run<Config>) {
        this.run = run;
        this.config = run.config;
        this.git = new GitClient(this.config);
        this.github = new GithubClient(this.config);
    }

    async init() {
        const masterDir = '_yfm-master' as RelativePath;
        const cleanup = await this.git.createMasterWorktree(
            this.run.originalInput,
            masterDir,
            'yfm-tmp-master',
        );

        try {
            await this.fillMTimes(this.run.originalInput);
            await this.fillContributors(join(this.run.originalInput, masterDir));
            await this.fillAuthors(join(this.run.originalInput, masterDir));
        } finally {
            await cleanup();
        }

        return this;
    }

    @bounded
    @memoize('login')
    async getUserByLogin(login: string): Promise<Contributor | null> {
        try {
            const user = await this.github.getRepoUser(login);
            return {
                login: user.login,
                url: user.html_url,
                avatar: user.avatar_url,
                email: user.email || '',
                name: user.name || '',
            };
        } catch (error) {
            this.run.logger.warn(dedent`
                Getting user for GitHub has been failed.
                Username: ${login}
                Error: ${error}
            `);

            return null;
        }
    }

    @bounded
    async getAuthorByPath(path: RelativePath): Promise<Contributor | null> {
        return this.authorByPath[normalizePath(path)] ?? null;
    }

    @bounded
    async getContributorsByPath(path: RelativePath, deps: RelativePath[]): Promise<Contributor[]> {
        const result: Hash<Contributor> = {};

        Object.assign(result, this.contributorsByPath[normalizePath(path)]);
        for (const dep of deps) {
            Object.assign(result, this.contributorsByPath[normalizePath(dep)]);
        }

        return Object.values(result);
    }

    @bounded
    async getModifiedTimeByPath(path: RelativePath) {
        return this.mtimeByPath[normalizePath(path)] ?? null;
    }

    private async fillContributors(baseDir: AbsolutePath) {
        this.run.logger.info('Contributors: Getting all contributors.');

        const contributors = await this.git.getContributors(normalizePath(baseDir) as AbsolutePath);

        for (const [path, commits] of Object.entries(contributors)) {
            for (const commit of commits) {
                const contributor = await this.getUserByCommit(commit);

                if (contributor) {
                    this.contributorsByPath[path as NormalizedPath] = (
                        this.contributorsByPath[path as NormalizedPath] || []
                    ).concat(contributor);
                }
            }
        }

        this.run.logger.info('Contributors: All contributors received.');
    }

    private async fillAuthors(baseDir: AbsolutePath) {
        this.run.logger.info('Contributors: Getting all authors.');

        const authors = await this.git.getAuthors(normalizePath(baseDir) as AbsolutePath);

        for (const [path, commit] of Object.entries(authors)) {
            const author = await this.getUserByCommit(commit);

            if (author) {
                this.authorByPath[path as NormalizedPath] = author;
            }
        }

        this.run.logger.info('Contributors: All authors received.');
    }

    private async fillMTimes(baseDir: AbsolutePath) {
        this.run.logger.info('Contributors: Getting all mtimes.');

        this.mtimeByPath = await this.git.getMTimes(normalizePath(baseDir) as AbsolutePath);

        this.run.logger.info('Contributors: All mtimes received.');
    }

    @memoize('sha')
    private async getUserByCommit(sha: string): Promise<Contributor | null> {
        try {
            const commitInfo = await this.github.getCommitInfo(sha);
            const {author, commit} = commitInfo;

            if (!author || !commit.author) {
                return null;
            }

            return {
                login: author.login,
                url: author.html_url,
                avatar: author.avatar_url,
                email: commit.author.email || '',
                name: commit.author.name || '',
            };
        } catch (error) {
            this.run.logger.warn(dedent`
                Getting commit by sha has been failed for GitHub.
                SHA: ${sha}
                Error: ${error}
            `);

            return null;
        }
    }
}
