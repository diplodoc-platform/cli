import {Octokit} from '@octokit/core';
import {join, normalize} from 'path';
import simpleGit, {SimpleGitOptions} from 'simple-git';
import pMap from 'p-map';

import github from './client/github';
import {ArgvService} from '../services';
import {
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

const MAX_CONCURRENCY = 99;

const authorByPath: Map<string, Contributor | null> = new Map();
const authorAlreadyCheckedForPath: Map<string, boolean> = new Map();
const contributorsByPath: Map<string, FileContributors> = new Map();
const contributorsData: Map<string, Contributor | null> = new Map();

async function getGitHubVCSConnector(): Promise<VCSConnector | undefined> {
    const {contributors} = ArgvService.getConfig();

    const httpClientByToken = getHttpClientByToken();
    if (!httpClientByToken) {
        return undefined;
    }

    let addNestedContributorsForPath: NestedContributorsForPathFunction = () => { };
    let getContributorsByPath: ContributorsByPathFunction = () => Promise.resolve({} as FileContributors);
    const getExternalAuthorByPath: ExternalAuthorByPathFunction = (path: string) => authorByPath.get(path) ?? null;

    if (contributors) {
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
        await simpleGit(options).raw('worktree', 'add', '-b', tmpMasterBranch, masterDir, 'origin/master');
        const fullRepoLogString = await simpleGit(options).raw(
            'log',
            `${FIRST_COMMIT_FROM_ROBOT_IN_GITHUB}..HEAD`,
            '--pretty=format:%ae, %H',
            '--name-only',
        );
        const repoLogs = fullRepoLogString.split('\n\n');
        await matchAuthorsForEachPath(repoLogs, httpClientByToken);
        await matchContributionsForEachPath(repoLogs, httpClientByToken);
    } finally {
        await simpleGit(options).raw('worktree', 'remove', masterDir);
        await simpleGit(options).raw('branch', '-d', tmpMasterBranch);
    }

    logger.info('', ALL_CONTRIBUTORS_RECEIVED);
}

async function matchContributionsForEachPath(repoLogs: string[], httpClientByToken: Octokit): Promise<void> {
    for (const repoLog of repoLogs) {
        if (!repoLog) {
            continue;
        }

        const dataArray = repoLog.split('\n');
        const userData = dataArray[0];
        const [email, hashCommit] = userData.split(', ');

        const hasContributorData = contributorsData.get(email);

        let contributorDataByHash;

        if (hasContributorData === undefined) {
            console.log('Getting data for', email);

            contributorDataByHash = await getContributorDataByHashCommit(httpClientByToken, hashCommit);

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

async function matchAuthorsForEachPath(repoLogs: string[], httpClientByToken: Octokit) {
    const {ignoreAuthor} = ArgvService.getConfig();

    for (const repoLog of repoLogs) {
        if (!repoLog) {
            continue;
        }

        const dataArray = repoLog.split('\n');
        const [userData, ...paths] = dataArray;
        const [email] = userData.split(', ');

        if (ignoreAuthor && email.includes(ignoreAuthor)) {
            continue;
        }

        await getAuthorByPaths(paths, httpClientByToken);
    }
}

async function getContributorDataByHashCommit(httpClientByToken: Octokit, hashCommit: string,
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

async function getAuthorByPaths(paths: string[], httpClientByToken: Octokit) {
    const externalCommits = (await pMap(paths, getAuthorForPath, {concurrency: MAX_CONCURRENCY})).filter(Boolean);

    for (const externalCommit of externalCommits) {
        if (!externalCommit) {
            continue;
        }

        const {hashCommit, normalizePath} = externalCommit;

        const repoCommit = await github.getRepoCommitByHash(httpClientByToken, hashCommit);
        if (!repoCommit) {
            continue;
        }

        const {author, commit} = repoCommit;
        if (!author) {
            continue;
        }

        const {avatar_url: avatar, html_url: url, login} = author;

        authorByPath.set(normalizePath, {
            avatar,
            email: commit.author.email,
            login,
            name: commit.author.name,
            url,
        });
    }
}

async function getFileContributorsByPath(path: string): Promise<FileContributors> {
    if (contributorsData.size === 0 || !contributorsByPath.has(path)) {
        return {} as FileContributors;
    }

    return contributorsByPath.get(path) as FileContributors;
}

async function getUserByLogin(octokit: Octokit, userLogin: string): Promise<Contributor | null> {
    const user = await github.getRepoUser(octokit, userLogin);

    if (!user) {
        return null;
    }

    const {avatar_url: avatar, html_url: url, email, login, name} = user;

    return {
        avatar,
        email,
        login,
        name,
        url,
    };
}

function addNestedContributorsForPathFunction(path: string, nestedContributors: Contributors): void {
    addContributorForPath([path], nestedContributors, true);
}

function addContributorForPath(paths: string[], newContributor: Contributors, hasIncludes = false): void {
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

async function getAuthorForPath(path: string) {
    if (!path) {
        return null;
    }

    const {rootInput, ignoreAuthor} = ArgvService.getConfig();
    const masterDir = './_yfm-master';
    const options: Partial<SimpleGitOptions> = {
        baseDir: join(rootInput, masterDir),
    };

    const normalizePath = normalize(addSlashPrefix(path));

    if (authorAlreadyCheckedForPath.has(normalizePath)) {
        return null;
    }

    const commitData = await simpleGit(options).raw(
        'log',
        `${FIRST_COMMIT_FROM_ROBOT_IN_GITHUB}..HEAD`,
        '--diff-filter=A',
        '--pretty=format:%ae;%H',
        '--',
        path,
    );

    const [email, hashCommit] = commitData.split(';');
    if (!(email && hashCommit)) {
        return null;
    }

    authorAlreadyCheckedForPath.set(normalizePath, true);

    if (ignoreAuthor && email.includes(ignoreAuthor)) {
        return null;
    }

    return {hashCommit, normalizePath};
}

export default getGitHubVCSConnector;
