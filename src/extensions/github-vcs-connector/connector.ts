import type {Run} from '@diplodoc/cli/lib/run';
import type {Contributor, VcsConnector} from '@diplodoc/cli/lib/vcs';
import type {Config} from './types';

import {join} from 'node:path';
import {uniqBy} from 'lodash';
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
        const {mtimes, authors, contributors} = this.config;
        const masterDir = '_yfm-master' as RelativePath;
        const cleanup = await this.git.createMasterWorktree(
            this.run.originalInput,
            masterDir,
            'yfm-tmp-master',
        );

        try {
            await Promise.all(
                [
                    mtimes && this.fillMTimes(this.run.originalInput),
                    authors && this.fillAuthors(join(this.run.originalInput, masterDir)),
                    contributors && this.fillContributors(join(this.run.originalInput, masterDir)),
                ].filter(Boolean),
            );
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
        const author = await this.getAuthorByPath(path);
        const result: Contributor[] = [];

        result.push(...(this.contributorsByPath[normalizePath(path)] || []));
        for (const dep of deps) {
            result.push(...(this.contributorsByPath[normalizePath(dep)] || []));
        }

        return uniqBy(result.filter(Boolean), ({login}) => login).filter(({login}) => login !== author?.login);
    }

    @bounded
    async getModifiedTimeByPath(path: RelativePath) {
        return this.mtimeByPath[normalizePath(path)] ?? null;
    }

    private async fillContributors(baseDir: AbsolutePath) {
        this.run.logger.info('Contributors: Getting all contributors.');

        const contributors = await this.git.getContributors(normalizePath(baseDir) as AbsolutePath);
        const infos = Object.values(contributors).reduce((a, b) => a.concat(b), []);
        const users = await this.getUsersByCommits(infos);

        for (const [path, infos] of Object.entries(contributors)) {
            this.contributorsByPath[path as NormalizedPath] = (
                this.contributorsByPath[path as NormalizedPath] || []
            ).concat(infos.map(({commit}) => users[commit]));
        }

        this.run.logger.info('Contributors: All contributors received.');
    }

    private async fillAuthors(baseDir: AbsolutePath) {
        this.run.logger.info('Contributors: Getting all authors.');

        const authors = await this.git.getAuthors(normalizePath(baseDir) as AbsolutePath);
        const users = await this.getUsersByCommits(Object.values(authors));

        for (const [path, {commit}] of Object.entries(authors)) {
            if (users[commit]) {
                this.authorByPath[path as NormalizedPath] = users[commit];
            }
        }

        this.run.logger.info('Contributors: All authors received.');
    }

    private async fillMTimes(baseDir: AbsolutePath) {
        this.run.logger.info('Contributors: Getting all mtimes.');

        this.mtimeByPath = await this.git.getMTimes(normalizePath(baseDir) as AbsolutePath);

        this.run.logger.info('Contributors: All mtimes received.');
    }

    private async getUsersByCommits(infos: {email: string; commit: string}[]) {
        const emails: Hash<string> = {};
        const aliases: Hash<string[]> = {};
        const requests: string[] = [];

        for (const {email, commit} of infos) {
            if (emails[email]) {
                aliases[emails[email]].push(commit);
            } else {
                emails[email] = commit;
                aliases[commit] = [commit];
                requests.push(commit);
            }
        }

        const commitsInfo = await this.github.getCommitsInfo(requests);

        return commitsInfo.reduce((result, info) => {
            for (const commit of aliases[info.oid]) {
                result[commit] = info.author.user;
            }

            return result;
        }, {} as Hash<Contributor>);
    }
}
