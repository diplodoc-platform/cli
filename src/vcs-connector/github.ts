import log from '@doc-tools/transform/lib/log';
import {Octokit} from '@octokit/core';
import {normalize} from 'path';

import github from './client/github';
import {ArgvService} from '../services';
import {Contributor, Contributors, ContributorsByPathFunction, NestedContributorsForPathFunction} from '../models';
import {
    GithubContributorDTO,
    FileContributors,
    GitHubConnectorFields,
    SourceType,
    GithubUserDTO,
    VCSConnector,
} from './connector-models';
import {
    ALL_CONTRIBUTORS_RECEIVED,
    FIRST_COMMIT_FROM_ROBOT_IN_GITHUB,
    GETTING_ALL_CONTRIBUTORS,
    REGEXP_BRANCH_NAME,
} from '../constants';
import {execAsync, logger} from '../utils';
import {validateConnectorFields} from './connector-validator';

const contributorsByPath: Map<string, FileContributors> = new Map();
const contributorsData: Map<string, Contributor | null> = new Map();

async function getGitHubVCSConnector(): Promise<VCSConnector | undefined> {
    const {contributors} = ArgvService.getConfig();

    const httpClientByToken = getHttpClientByToken();
    if (!httpClientByToken) {
        return;
    }

    let addNestedContributorsForPath: NestedContributorsForPathFunction = () => { };
    let getContributorsByPath: ContributorsByPathFunction = () => Promise.resolve({} as FileContributors);

    if (contributors) {
        await getAllContributorsTocFiles(httpClientByToken);
        addNestedContributorsForPath = (path: string, nestedContributors: Contributors) =>
            addNestedContributorsForPathFunction(path, nestedContributors);
        getContributorsByPath = await getContributorsByPathFunction(httpClientByToken);
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
    // TODO: remove after fix issue with sync from github to bb
    const mainBranch = await execAsync(`cd ${rootInput} && git branch --show-current`);
    const fullRepoLogString = await execAsync(`cd ${rootInput} && git checkout master --quiet && ${commandGetLogs}`);

    const repoLogs = fullRepoLogString.split('\n\n');
    await matchContributionsForEachPath(repoLogs, httpClientByToken);

    const branch = mainBranch.match(REGEXP_BRANCH_NAME);
    if (branch && branch.length > 0) {
        await execAsync(`cd ${rootInput} && git checkout ${branch[0]}`);
    } else {
        log.warn(`Changing branch failed for GitHub. 
            Main branch: ${mainBranch}.Parsed branch: ${JSON.stringify(branch)}`);
    }

    logger.info('', ALL_CONTRIBUTORS_RECEIVED);
}

async function matchContributionsForEachPath(repoLogs: string[], httpClientByToken: Octokit): Promise<void> {
    for (const repoLog of repoLogs) {
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

async function getContributorsByPathFunction(httpClientByToken: Octokit): Promise<ContributorsByPathFunction> {
    const allContributors = await getAllContributors(httpClientByToken);

    const getContributorsFunction = async (path: string) => {
        return getContributorsByPath(path, allContributors);
    };

    return getContributorsFunction;
}

async function getAllContributors(httpClientByToken: Octokit): Promise<Contributors> {
    try {
        const repoContributors = await github.getRepoContributors(httpClientByToken);
        const promises: Promise<GithubUserDTO | null>[] = [];

        repoContributors.forEach((contributor: GithubContributorDTO) => {
            if (contributor.login) {
                promises.push(github.getRepoUser(httpClientByToken, contributor.login));
            }
        });

        const repoUsers = await Promise.all(promises);
        const contributors: Contributors = {};

        repoUsers.forEach((user: GithubUserDTO | null) => {
            if (user) {
                const {email, login, name, avatar_url: avatarUrl, html_url: url} = user;
                contributors[email || login] = {
                    avatar: avatarUrl,
                    email,
                    login,
                    name,
                    url,
                };
            }
        });

        return contributors;
    } catch (error) {
        log.error(`Getting of contributors has been failed. Error: ${JSON.stringify(error)}`);
        throw error;
    }
}

async function getContributorsByPath(path: string, allContributors: Contributors): Promise<FileContributors> {
    if (Object.keys(allContributors).length === 0 || !contributorsByPath.has(path)) {
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
        const normalizePath = normalize(`${path.startsWith('/') ? '' : '/'}${path}`);

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
