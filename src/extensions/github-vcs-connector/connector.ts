import type {SimpleGitOptions} from 'simple-git';
import type {Run} from '@diplodoc/cli/lib/run';
import type {Contributor, Contributors, VcsConnector} from '@diplodoc/cli/lib/vcs';
import type {Config} from './types';

import {join} from 'node:path';
import simpleGit from 'simple-git';
import {minimatch} from 'minimatch';
import {dedent} from 'ts-dedent';

import {GithubClient} from './client';
import {bounded, memoize} from '~/core/utils';
// import {FIRST_COMMIT_FROM_ROBOT_IN_GITHUB} from '~/constants';

export type * from './types';

export class GithubVcsConnector implements VcsConnector {
    private authorByPath = new Map<NormalizedPath, Contributor>();

    private contributorsByPath = new Map<NormalizedPath, Contributors>();

    private mtimeByPath = new Map<NormalizedPath, number>();

    private run: Run<Config>;

    private config: Config;

    private normalize: (path: RelativePath) => NormalizedPath;

    private github: GithubClient;

    constructor(run: Run<Config>) {
        this.run = run;
        this.config = run.config;
        this.normalize = run.normalize;
        this.github = new GithubClient(this.config.vcs);
    }

    async init() {
        const masterDir = '_yfm-master' as RelativePath;
        const cleanup = await this.createMasterWorktree(masterDir, 'yfm-tmp-master');

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
    async getUserByPath(path: RelativePath): Promise<Contributor | null> {
        return this.authorByPath.get(this.normalize(path)) ?? null;
    }

    @bounded
    @memoize('login')
    async getUserByLogin(login: string): Promise<Contributor | null> {
        try {
            const user = await this.github.getRepoUser(login);
            return {
                avatar: user.avatar_url,
                email: user.email || '',
                login: user.login,
                name: user.name || '',
                url: user.html_url,
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
    @memoize('path')
    async getContributorsByPath(path: RelativePath, deps: RelativePath[]): Promise<Contributors> {
        const result: Contributors = {};

        Object.assign(result, this.contributorsByPath.get(this.normalize(path)));
        for (const dep of deps) {
            Object.assign(result, this.contributorsByPath.get(this.normalize(dep)));
        }

        return result;
    }

    @bounded
    async getModifiedTimeByPath(path: RelativePath) {
        return this.mtimeByPath.get(this.normalize(path)) ?? null;
    }

    private async createMasterWorktree(dir: RelativePath, branch: string) {
        const options: Partial<SimpleGitOptions> = {
            baseDir: this.run.originalInput,
        };

        try {
            await simpleGit(options).raw('worktree', 'add', '-b', branch, dir, 'origin/master');
        } catch {}

        return async () => {
            await simpleGit(options).raw('worktree', 'remove', dir);
            await simpleGit(options).raw('branch', '-d', branch);
        };
    }

    private async fillContributors(baseDir: AbsolutePath) {
        this.run.logger.info('Contributors: Getting all contributors.');

        const log = await simpleGit({baseDir}).raw(
            'log',
            `${this.config.vcs.initialCommit}..HEAD`,
            '--pretty=format:%ae;%an;%H',
            '--name-only',
        );
        const parts = log.split('\n\n').filter(Boolean);

        for (const part of parts) {
            const [userData, ...rawPaths] = part.split('\n');
            const [email, name, hashCommit] = userData.split(';');

            if (shouldAuthorBeIgnored(this.config, {email, name})) {
                continue;
            }

            const contributorByCommit = await this.getUserByCommit(hashCommit, email);

            if (contributorByCommit) {
                const paths = (rawPaths as RelativePath[]).filter(Boolean).map(this.normalize);
                for (const path of paths) {
                    const contributors = this.contributorsByPath.get(path) || {};

                    this.contributorsByPath.set(path, {
                        ...contributors,
                        [email]: contributorByCommit,
                    });
                }
            }
        }

        this.run.logger.info('Contributors: All contributors received.');
    }

    private async fillAuthors(baseDir: AbsolutePath) {
        const log = await simpleGit({baseDir}).raw(
            'log',
            `${this.config.vcs.initialCommit}..HEAD`,
            '--diff-filter=A',
            '--pretty=format:%ae;%an;%H',
            '--name-only',
        );
        const parts = log.split('\n\n').filter(Boolean);

        for (const part of parts) {
            const [userData, ...rawPaths] = part.split('\n');
            const [email, name, hashCommit] = userData.split(';');

            if (shouldAuthorBeIgnored(this.config, {email, name})) {
                continue;
            }

            const authorByCommit = await this.getUserByCommit(hashCommit, email);

            if (authorByCommit) {
                const paths = (rawPaths as RelativePath[]).filter(Boolean).map(this.normalize);
                for (const path of paths) {
                    this.authorByPath.set(path, authorByCommit);
                }
            }
        }
    }

    private async fillMTimes(baseDir: AbsolutePath) {
        const log = await simpleGit({baseDir}).raw(
            'log',
            '--reverse',
            '--before=now',
            '--diff-filter=ADMR',
            '--pretty=format:%ct',
            '--name-status',
        );
        const parts = log.split(/\n\n/).filter(Boolean);

        for (const part of parts) {
            const [date, ...lines] = part.trim().split(/\n/);
            const unixtime = Number(date);

            for (const line of lines) {
                const [status, rawFrom, rawTo] = line.split(/\t/);
                const from = this.normalize((rawFrom || '') as RelativePath);
                const to = this.normalize((rawTo || '') as RelativePath);

                switch (status[0]) {
                    case 'R': {
                        this.mtimeByPath.delete(from);
                        this.mtimeByPath.set(to, unixtime);
                        break;
                    }
                    case 'D': {
                        this.mtimeByPath.delete(from);
                        break;
                    }
                    default: {
                        this.mtimeByPath.set(from, unixtime);
                    }
                }
            }
        }
    }

    @memoize('sha')
    private async getUserByCommit(sha: string, email: string): Promise<Contributor | null> {
        this.run.logger.info('Contributors: Getting data for', email);

        try {
            const commitInfo = await this.github.getCommitInfo(sha);
            const {author, commit} = commitInfo;

            if (!author || !commit.author) {
                return null;
            }

            return {
                avatar: author.avatar_url,
                email: commit.author.email || '',
                login: author.login,
                name: commit.author.name || '',
                url: author.html_url,
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

type ShouldAuthorBeIgnoredArgs = {
    email?: string;
    name?: string;
};

function shouldAuthorBeIgnored(config: Config, {email, name}: ShouldAuthorBeIgnoredArgs) {
    if (!(email || name)) {
        return false;
    }

    const {ignoreAuthorPatterns} = config;
    if (!ignoreAuthorPatterns) {
        return false;
    }

    for (const pattern of ignoreAuthorPatterns) {
        if (email && minimatch(email, pattern)) {
            return true;
        }

        if (name && minimatch(name, pattern)) {
            return true;
        }
    }

    return false;
}
