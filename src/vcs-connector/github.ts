import {Octokit} from '@octokit/core';
import {join, normalize} from 'path';
import simpleGit, {SimpleGitOptions} from 'simple-git';
import {minimatch} from 'minimatch';

import github from './client/github';
import {ArgvService} from '../services';
import {
    CommitInfo,
    Contributor,
    Contributors,
    ContributorsByPathFunction,
    ExternalAuthorByPathFunction,
    NestedContributorsForPathFunction,
} from '../models';
import {
    FileContributors,
    GitHubConnectorFields,
    SourceType,
    VCSConnector,
} from './connector-models';
import {
    ALL_CONTRIBUTORS_RECEIVED,
    FIRST_COMMIT_FROM_ROBOT_IN_GITHUB,
    GETTING_ALL_CONTRIBUTORS,
} from '../constants';
import {addSlashPrefix, logger} from '../utils';
import {validateConnectorFields} from './connector-validator';
import process from 'process';

const authorByGitEmail: Map<string, Contributor | null> = new Map();
const authorByPath: Map<string, Contributor | null> = new Map();
const contributorsByPath: Map<string, FileContributors> = new Map();
const contributorsData: Map<string, Contributor | null> = new Map();
const loginUserMap: Map<string, Contributor | null> = new Map();
const pathMTime = new Map<string, number>();

async function getGitHubVCSConnector(): Promise<VCSConnector | undefined> {
    const {contributors, rootInput} = ArgvService.getConfig();

    const httpClientByToken = getHttpClientByToken();
    if (!httpClientByToken) {
        return undefined;
    }

    let addNestedContributorsForPath: NestedContributorsForPathFunction = () => {};
    let getContributorsByPath: ContributorsByPathFunction = () =>
        Promise.resolve({} as FileContributors);
    const getExternalAuthorByPath: ExternalAuthorByPathFunction = (path: string) =>
        authorByPath.get(path) ?? null;

    if (contributors) {
        await getFilesMTime(rootInput, pathMTime);
        await getAllContributorsTocFiles(httpClientByToken);
        addNestedContributorsForPath = (path: string, nestedContributors: Contributors) =>
            addNestedContributorsForPathFunction(path, nestedContributors);
        getContributorsByPath = async (path: string) => getFileContributorsByPath(path);
    }

    return {
        getExternalAuthorByPath,
        addNestedContributorsForPath,
        getContributorsByPath,
        getUserByLogin: (login: string) => getUserByLogin(httpClientByToken, login),
        getModifiedTimeByPath: (filename: string) => pathMTime.get(filename),
    };
}

function getHttpClientByToken(): Octokit | null {
    const {connector, contributors} = ArgvService.getConfig();

    if (!contributors) {
        return null;
    }

    const neededProperties = [GitHubConnectorFields.TOKEN, GitHubConnectorFields.ENDPOINT];
    const validatedFileds = validateConnectorFields(SourceType.GITHUB, neededProperties, connector);

    if (Object.keys(validatedFileds).length === 0) {
        return null;
    }

    const octokit = new Octokit({
        auth: validatedFileds[GitHubConnectorFields.TOKEN] as string,
        baseUrl: validatedFileds[GitHubConnectorFields.ENDPOINT] as string,
    });

    return octokit;
}

async function getAllContributorsTocFiles(httpClientByToken: Octokit): Promise<void> {
    const {rootInput} = ArgvService.getConfig();

    const options: Partial<SimpleGitOptions> = {
        baseDir: rootInput,
    };

    logger.info('', GETTING_ALL_CONTRIBUTORS);

    const masterDir = './_yfm-master';
    const tmpMasterBranch = 'yfm-tmp-master';

    try {
        await simpleGit(options).raw(
            'worktree',
            'add',
            '-b',
            tmpMasterBranch,
            masterDir,
            'origin/master',
        );
        const fullRepoLogString = await simpleGit({
            baseDir: join(rootInput, masterDir),
        }).raw(
            'log',
            `${FIRST_COMMIT_FROM_ROBOT_IN_GITHUB}..HEAD`,
            '--pretty=format:%ae, %an, %H',
            '--name-only',
        );
        const repoLogs = fullRepoLogString.split('\n\n');
        if (process.env.ENABLE_EXPERIMANTAL_AUTHORS) {
            const fullAuthorRepoLogString = await simpleGit({
                baseDir: join(rootInput, masterDir),
            }).raw(
                'log',
                `${FIRST_COMMIT_FROM_ROBOT_IN_GITHUB}..HEAD`,
                '--diff-filter=A',
                '--pretty=format:%ae;%an;%H',
                '--name-only',
            );
            const authorRepoLog = fullAuthorRepoLogString.split('\n\n');
            await matchAuthorsForEachPath(authorRepoLog, httpClientByToken);
        }
        await matchContributionsForEachPath(repoLogs, httpClientByToken);
    } finally {
        await simpleGit(options).raw('worktree', 'remove', masterDir);
        await simpleGit(options).raw('branch', '-d', tmpMasterBranch);
    }

    logger.info('', ALL_CONTRIBUTORS_RECEIVED);
}

async function matchContributionsForEachPath(
    repoLogs: string[],
    httpClientByToken: Octokit,
): Promise<void> {
    for (const repoLog of repoLogs) {
        if (!repoLog) {
            continue;
        }

        const dataArray = repoLog.split('\n');
        const userData = dataArray[0];
        const [email, name, hashCommit] = userData.split(', ');

        if (shouldAuthorBeIgnored({email, name})) {
            continue;
        }

        const hasContributorData = contributorsData.get(email);

        let contributorDataByHash;

        if (hasContributorData === undefined) {
            logger.info('Contributors: Getting data for', email);

            contributorDataByHash = await getContributorDataByHashCommit(
                httpClientByToken,
                hashCommit,
            );

            if (contributorDataByHash) {
                const paths = dataArray.splice(1);
                addContributorForPath(paths, {
                    [email]: contributorDataByHash,
                });
            }
            contributorsData.set(email, contributorDataByHash);
        } else if (hasContributorData) {
            const paths = dataArray.splice(1);
            addContributorForPath(paths, {
                [email]: hasContributorData,
            });
        }
    }
}

async function matchAuthorsForEachPath(authorRepoLogs: string[], httpClientByToken: Octokit) {
    for (const repoLog of authorRepoLogs) {
        if (!repoLog) {
            continue;
        }

        const dataArray = repoLog.split('\n');
        const [userData, ...paths] = dataArray;
        const [email, name, hashCommit] = userData.split(';');

        if (shouldAuthorBeIgnored({email, name})) {
            continue;
        }

        await getAuthorByPaths({email, hashCommit}, paths, httpClientByToken);
    }
}

async function getContributorDataByHashCommit(
    httpClientByToken: Octokit,
    hashCommit: string,
): Promise<Contributor | null> {
    const repoCommit = await github.getRepoCommitByHash(httpClientByToken, hashCommit);

    if (!repoCommit) {
        return null;
    }

    const {author, commit} = repoCommit;

    if (!author) {
        return null;
    }

    const {avatar_url: avatar, html_url: url, login} = author;

    return {
        avatar,
        email: commit.author.email,
        login,
        name: commit.author.name,
        url,
    };
}

async function getAuthorByPaths(
    commitInfo: CommitInfo,
    paths: string[],
    httpClientByToken: Octokit,
) {
    for (const path of paths) {
        if (!path) {
            continue;
        }
        const normalizePath = normalize(addSlashPrefix(path));
        const {email, hashCommit} = commitInfo;

        let authorToReturn = authorByGitEmail.get(email) || null;

        if (!authorToReturn) {
            logger.info('Authors: Getting data for', email);

            const repoCommit = await github.getRepoCommitByHash(httpClientByToken, hashCommit);
            if (!repoCommit) {
                continue;
            }

            const {author, commit} = repoCommit;
            if (!author) {
                continue;
            }

            const {avatar_url: avatar, html_url: url, login} = author;
            authorToReturn = {
                avatar,
                email: commit.author.email,
                login,
                name: commit.author.name,
                url,
            };
            authorByGitEmail.set(email, authorToReturn);
        }

        authorByPath.set(normalizePath, authorToReturn);
    }
}

async function getFileContributorsByPath(path: string): Promise<FileContributors> {
    if (contributorsData.size === 0 || !contributorsByPath.has(path)) {
        return {} as FileContributors;
    }

    return contributorsByPath.get(path) as FileContributors;
}

async function getUserByLogin(octokit: Octokit, userLogin: string): Promise<Contributor | null> {
    let result = loginUserMap.get(userLogin);
    if (!result) {
        const user = await github.getRepoUser(octokit, userLogin);
        if (!user) {
            return null;
        }

        const {avatar_url: avatar, html_url: url, email, login, name} = user;

        result = {
            avatar,
            email,
            login,
            name,
            url,
        };

        loginUserMap.set(userLogin, result);
    }

    return result;
}

function addNestedContributorsForPathFunction(
    path: string,
    nestedContributors: Contributors,
): void {
    addContributorForPath([path], nestedContributors, true);
}

function addContributorForPath(
    paths: string[],
    newContributor: Contributors,
    hasIncludes = false,
): void {
    paths.forEach((path: string) => {
        const normalizePath = normalize(addSlashPrefix(path));

        if (!contributorsByPath.has(normalizePath)) {
            contributorsByPath.set(normalizePath, {
                contributors: newContributor,
                hasIncludes,
            });
            return;
        }

        const oldContributors = contributorsByPath.get(normalizePath);

        contributorsByPath.set(normalizePath, {
            contributors: {
                ...oldContributors?.contributors,
                ...newContributor,
            },
            hasIncludes,
        });
    });
}

type ShouldAuthorBeIgnoredArgs = {
    email?: string;
    name?: string;
};

function shouldAuthorBeIgnored({email, name}: ShouldAuthorBeIgnoredArgs) {
    if (!(email || name)) {
        return false;
    }

    const {ignoreAuthorPatterns} = ArgvService.getConfig();
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

async function getFilesMTime(repoDir: string, pathMTime: Map<string, number>) {
    const timeFiles = await simpleGit({
        baseDir: repoDir,
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
                    pathMTime.delete(from);
                    pathMTime.set(to, unixtime);
                    break;
                }
                case 'D': {
                    pathMTime.delete(from);
                    break;
                }
                default: {
                    pathMTime.set(from, unixtime);
                }
            }
        });
    });
    return pathMTime;
}

export default getGitHubVCSConnector;
