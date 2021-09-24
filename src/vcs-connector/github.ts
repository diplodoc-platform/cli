import {Octokit} from '@octokit/core';
import {join, normalize} from 'path';

import github from './client/github';
import {ArgvService} from '../services';
import {Contributor, Contributors, ContributorsByPathFunction, NestedContributorsForPathFunction} from '../models';
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
import {addSlashPrefix, execAsync, logger} from '../utils';
import {validateConnectorFields} from './connector-validator';

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

    if (contributors) {
        await getAllContributorsTocFiles(httpClientByToken);
        addNestedContributorsForPath = (path: string, nestedContributors: Contributors) =>
            addNestedContributorsForPathFunction(path, nestedContributors);
        getContributorsByPath = async (path: string) => getFileContributorsByPath(path);
    }

    return {
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
        auth: validatedFileds[GitHubConnectorFields.TOKEN],
        baseUrl: validatedFileds[GitHubConnectorFields.ENDPOINT],
    });

    return octokit;
}

async function getAllContributorsTocFiles(httpClientByToken: Octokit): Promise<void> {
    const {rootInput} = ArgvService.getConfig();
    logger.info('', GETTING_ALL_CONTRIBUTORS);

    const commandGetLogs = `git log ${FIRST_COMMIT_FROM_ROBOT_IN_GITHUB}..HEAD --pretty=format:"%ae, %H" --name-only`;
    const masterDir = './_yfm-master';
    const tmpMasterBranch = 'yfm-tmp-master';

    try {
        await execAsync(`cd ${rootInput} && git worktree add -b ${tmpMasterBranch} ${masterDir} origin/master`);
        const fullRepoLogString = await execAsync(`cd ${join(rootInput, masterDir)} && ${commandGetLogs}`);

        const repoLogs = fullRepoLogString.split('\n\n');
        await matchContributionsForEachPath(repoLogs, httpClientByToken);
    } finally {
        await execAsync(`cd ${rootInput} && git worktree remove ${masterDir} && git branch -d ${tmpMasterBranch}`);
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

export default getGitHubVCSConnector;
