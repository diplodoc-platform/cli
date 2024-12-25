import simpleGit, {SimpleGitOptions} from 'simple-git';
import path from 'node:path';
import {FIRST_COMMIT_FROM_ROBOT_IN_GITHUB} from './constants';
import {minimatch} from 'minimatch';
import {Author, GithubCommitDTO, GithubUserDTO} from './types';
import pMap from 'p-map';
import assert from 'node:assert';
import {Octokit} from '@octokit/core';
import * as process from 'node:process';
import {BuildConfig, Run} from '~/commands/build';
import {logger} from '~/utils';
import {SourceType} from '~/vcs-connector/connector-models';

/*eslint-disable no-console*/

const MASTER_DIR = '_yfm-master';
const MASTER_BRANCH = 'origin/master';
const TMP_MASTER_BRANCH_NAME = 'yfm-tmp-master';

export interface GithubConnectorProps {
    options: BuildConfig;
    cwd: string;
    ignoreAuthorPatterns?: string[];
    logger: typeof logger;
    run: Run;
}

class GithubConnector {
    client;
    props;
    connectorOptions;

    fileMtime = new Map<string, number>();
    emailAuthor = new Map<string, Author>();
    loginAuthor = new Map<string, Author>();
    pathContributors = new Map<string, Author[]>();
    pathAuthor = new Map<string, Author>();
    authors: Author[] = [];

    constructor(props: GithubConnectorProps) {
        const {
            run: {legacyConfig},
        } = props;
        const connectorOptions = legacyConfig.connector?.[SourceType.GITHUB];
        assert(connectorOptions, 'Github connector options are required');
        this.props = props;
        this.connectorOptions = connectorOptions;
        this.client = new Octokit({
            auth: this.connectorOptions.token || process.env.GITHUB_TOKEN,
            baseUrl: this.connectorOptions.endpoint || process.env.GITHUB_BASE_URL,
        });

        const inflightCache = new Map<string, Promise<Author | null>>();
        this.getAuthorByUsername = ((run) => {
            return async (username: string) => {
                let promise = inflightCache.get(username);
                if (!promise) {
                    promise = run(username).finally(() => {
                        inflightCache.delete(username);
                    });
                    inflightCache.set(username, promise);
                }
                return promise;
            };
        })(this.getAuthorByUsername.bind(this));

        this.getAuthorByCommitHash = ((run) => {
            return async (commitHash: string) => {
                let promise = inflightCache.get(commitHash);
                if (!promise) {
                    promise = run(commitHash).finally(() => {
                        inflightCache.delete(commitHash);
                    });
                    inflightCache.set(commitHash, promise);
                }
                return promise;
            };
        })(this.getAuthorByCommitHash.bind(this));
    }

    async init() {
        const options: Partial<SimpleGitOptions> = {
            baseDir: this.props.cwd,
        };

        try {
            await simpleGit(options).raw(
                'worktree',
                'add',
                '-b',
                TMP_MASTER_BRANCH_NAME,
                MASTER_DIR,
                MASTER_BRANCH,
            );
            await this.fetchFileMtime();
            await this.fetchContributors();
            await this.fetchAuthors();
        } finally {
            await simpleGit(options).raw('worktree', 'remove', MASTER_DIR);
            await simpleGit(options).raw('branch', '-d', TMP_MASTER_BRANCH_NAME);
        }
    }

    async getAuthorByUsername(username: string) {
        const cachedAuthor = this.loginAuthor.get(username);
        if (cachedAuthor) {
            return cachedAuthor;
        }

        try {
            const response = await this.client.request('GET /users/{username}', {
                username,
            });

            const {
                avatar_url: avatar,
                html_url: url,
                login,
                email,
                name,
            } = response.data as GithubUserDTO;

            const author = {
                avatar,
                email,
                login,
                name,
                url,
            } satisfies Author;

            this.authors.push(author);
            this.loginAuthor.set(login, author);
            if (email) {
                this.emailAuthor.set(email, author);
            }

            return author;
        } catch (err) {
            const error = err as Error;
            this.props.logger.warn(
                '-',
                `Getting user for GitHub has been failed. Username: ${username}. Error: ${error.stack}`,
            );
            return null;
        }
    }

    async getAuthorByCommitHash(hash: string) {
        try {
            const response = await this.client.request(
                'GET /repos/{owner}/{repo}/commits/{commit_sha}',
                {
                    owner: this.connectorOptions.owner || process.env.GITHUB_OWNER,
                    repo: this.connectorOptions.repo || process.env.GITHUB_REPO,
                    commit_sha: hash,
                },
            );

            const {author: rawAuthor, commit} = response.data as GithubCommitDTO;
            if (!rawAuthor) {
                // it happens when user account was removed
                /*console.warn(
                    `Getting commit by sha has been failed for GitHub. SHA commit: ${hash}, cause: Empty response`,
                );*/
                return null;
            }

            const {avatar_url: avatar, html_url: url, login} = rawAuthor;
            const {email, name} = commit.author;

            const author = {
                avatar,
                email,
                login,
                name,
                url,
            } satisfies Author;

            this.authors.push(author);
            this.loginAuthor.set(login, author);
            if (email) {
                this.emailAuthor.set(email, author);
            }

            return author;
        } catch (err) {
            const error = err as Error;
            this.props.logger.warn(
                '-',
                `Getting commit by sha has been failed for GitHub. SHA commit: ${hash}. Error: ${error.stack}`,
            );
            return null;
        }
    }

    getAuthor(pagePath: string) {
        return this.pathAuthor.get(pagePath);
    }

    getMtime(pagePath: string, includePaths: string[]) {
        const times: number[] = [];
        [pagePath, ...includePaths].forEach((filePath) => {
            const time = this.fileMtime.get(filePath);
            if (time) {
                times.push(time);
            }
        });
        if (times.length) {
            const mtime = Math.max(...times);
            return new Date(mtime * 1000).toISOString();
        }
        return undefined;
    }

    getContributors(pagePath: string, includePaths: string[]) {
        const pageContributors: Author[] = [];
        [pagePath, ...includePaths].forEach((filePath) => {
            const contributors = this.pathContributors.get(filePath);
            contributors?.forEach((author) => {
                if (!pageContributors.includes(author)) {
                    pageContributors.push(author);
                }
            });
        });
        return pageContributors;
    }

    serialize() {
        const pathContributorIndexes = new Map<string, number[]>();
        this.pathContributors.forEach((value, key) => {
            pathContributorIndexes.set(
                key,
                value.map((author) => this.authors.indexOf(author)),
            );
        });
        const pathAuthorIndex = new Map<string, number>();
        this.pathAuthor.forEach((value, key) => {
            pathAuthorIndex.set(key, this.authors.indexOf(value));
        });
        return {
            fileMtime: this.fileMtime,
            authors: this.authors,
            pathContributorIndexes,
            pathAuthorIndex,
        };
    }

    deserialize({
        fileMtime,
        authors,
        pathContributorIndexes,
        pathAuthorIndex,
    }: ReturnType<GithubConnector['serialize']>) {
        authors.forEach((author) => {
            const {email, login} = author;
            this.loginAuthor.set(login, author);
            if (email) {
                this.emailAuthor.set(email, author);
            }
        });
        const pathContributors = new Map<string, Author[]>();
        pathContributorIndexes.forEach((indexes, key) => {
            pathContributors.set(
                key,
                indexes.map((index) => {
                    const author = authors[index];
                    assert(author, `Author for index ${index} not found`);
                    return author;
                }),
            );
        });
        const pathAuthor = new Map<string, Author>();
        pathAuthorIndex.forEach((index, key) => {
            const author = authors[index];
            assert(author, `Author for index ${index} not found`);
            pathAuthor.set(key, author);
        });
        this.fileMtime = fileMtime;
        this.pathContributors = pathContributors;
        this.pathAuthor = pathAuthor;
    }

    private async fetchContributors() {
        const fullRepoLogString = await simpleGit({
            baseDir: path.join(this.props.cwd, MASTER_DIR),
        }).raw(
            'log',
            `${FIRST_COMMIT_FROM_ROBOT_IN_GITHUB}..HEAD`,
            '--pretty=format:%ae, %an, %H',
            '--name-only',
        );
        const repoLogs = fullRepoLogString.split('\n\n');

        const pathEmails = new Map<string, string[]>();
        const emailInfo = new Map<string, {name: string; hash: string}>();
        for (const repoLog of repoLogs) {
            if (!repoLog) {
                continue;
            }

            const dataArray = repoLog.split('\n');
            const [userData, ...paths] = dataArray;
            const [email, name, hashCommit] = userData.split(', ');

            let info = emailInfo.get(email);
            if (!info) {
                info = {name, hash: hashCommit};
                emailInfo.set(email, info);
            }
            paths.forEach((p) => {
                let emails = pathEmails.get(p);
                if (!emails) {
                    emails = [];
                    pathEmails.set(p, emails);
                }
                const pos = emails.indexOf(email);
                if (pos !== -1) {
                    emails.splice(pos, 1);
                }
                emails.push(email);
            });
        }

        await pMap(
            Array.from(emailInfo.entries()),
            async ([email, {name, hash}]) => {
                if (this.shouldAuthorBeIgnored(email, name)) {
                    return;
                }

                let author: Author | undefined | null = this.emailAuthor.get(email);
                if (!author) {
                    author = await this.getAuthorByCommitHash(hash);
                }
                if (author) {
                    this.emailAuthor.set(email, author);
                }
            },
            {concurrency: 10},
        );

        pathEmails.forEach((emails, p) => {
            let contributors = this.pathContributors.get(p);
            if (!contributors) {
                contributors = [];
                this.pathContributors.set(p, contributors);
            }
            emails.forEach((email) => {
                const author = this.emailAuthor.get(email);
                if (author) {
                    contributors.push(author);
                }
            });
        });
    }

    private async fetchAuthors() {
        const fullAuthorRepoLogString = await simpleGit({
            baseDir: path.join(this.props.cwd, MASTER_DIR),
        }).raw(
            'log',
            `${FIRST_COMMIT_FROM_ROBOT_IN_GITHUB}..HEAD`,
            '--diff-filter=A',
            '--pretty=format:%ae;%an;%H',
            '--name-only',
        );

        const authorRepoLog = fullAuthorRepoLogString.split('\n\n');

        const emailInfo = new Map<string, {name: string; hash: string; paths: Set<string>}>();
        for (const repoLog of authorRepoLog) {
            if (!repoLog) {
                continue;
            }

            const dataArray = repoLog.split('\n');
            const [userData, ...paths] = dataArray;
            const [email, name, hashCommit] = userData.split(';');

            let info = emailInfo.get(email);
            if (!info) {
                info = {name, hash: hashCommit, paths: new Set()};
                emailInfo.set(email, info);
            }
            paths.forEach((v) => info.paths.add(v));
        }

        await pMap(
            Array.from(emailInfo.entries()),
            async ([email, {name, hash, paths}]) => {
                if (this.shouldAuthorBeIgnored(email, name)) {
                    return;
                }

                let author: Author | undefined | null = this.emailAuthor.get(email);
                if (!author) {
                    author = await this.getAuthorByCommitHash(hash);
                }
                if (author) {
                    this.emailAuthor.set(email, author);
                    paths.forEach((place) => {
                        this.pathAuthor.set(place, author);
                    });
                }
            },
            {concurrency: 10},
        );
    }

    private shouldAuthorBeIgnored(email: string, name: string) {
        const {ignoreAuthorPatterns} = this.props;

        if (!(email || name)) {
            return false;
        }

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

    private async fetchFileMtime() {
        const timeFiles = await simpleGit({
            baseDir: this.props.cwd,
        }).raw(
            'log',
            '--reverse',
            '--before=now',
            '--diff-filter=ADMR',
            '--pretty=format:%ct',
            '--name-status',
        );

        const parts = timeFiles.split(/\n\n/);
        parts.forEach((part) => {
            const lines = part.trim().split(/\n/);
            const committerDate = lines.shift();
            const unixtime = Number(committerDate);
            lines.forEach((line) => {
                const [status, from, to] = line.split(/\t/);
                switch (status[0]) {
                    case 'R': {
                        this.fileMtime.delete(from);
                        this.fileMtime.set(to, unixtime);
                        break;
                    }
                    case 'D': {
                        this.fileMtime.delete(from);
                        break;
                    }
                    default: {
                        this.fileMtime.set(from, unixtime);
                    }
                }
            });
        });
    }
}

export default GithubConnector;
