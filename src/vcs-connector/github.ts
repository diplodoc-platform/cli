import log from '@doc-tools/transform/lib/log';
import {Octokit} from '@octokit/core';
import {join} from 'path';
import {existsSync} from 'fs';
import simpleGit, {SimpleGit} from 'simple-git';
import {ArgvService} from '../services';
import {Contributor, Contributors, ContributorsFunction, Users} from '../models';
import {ContributorDTO, GithubContributorDTO, GithubLogsDTO, SourceType, UserDTO, VCSConnector} from './models';
import {getMsgСonfigurationMustBeProvided} from '../constants';

async function getGitHubVCSConnector(): Promise<VCSConnector> {
    const {contributors} = ArgvService.getConfig();

    return {
        getContributorsByPath: contributors
            ? await getGithubContributorsByPathFunction()
            : () => Promise.resolve([]),
    };
}

function getHttpClientByToken(): Octokit {
    const {GITHUB_TOKEN, GITHUB_BASE_URL} = process.env;
    const {connector} = ArgvService.getConfig();
    const token = GITHUB_TOKEN || connector && connector.gitHub.token || '';
    const endpoint = GITHUB_BASE_URL || connector && connector.gitHub.endpoint || '';

    if (!token || !endpoint) {
        log.warn(getMsgСonfigurationMustBeProvided(SourceType.GITHUB));
    }

    const octokit = new Octokit({auth: token, baseUrl: endpoint});

    return octokit;
}

async function getGithubContributorsByPathFunction(): Promise<ContributorsFunction> {
    const {contributors, rootInput} = ArgvService.getConfig();
    const httpClientByToken = getHttpClientByToken();

    const gitSource: SimpleGit = simpleGit(rootInput, {binary: 'git'});

    const allContributors = contributors ? await getAllContributors(httpClientByToken) : {};

    const getGithubContributorsFunction = async (path: string) => {
        const filePath = join(rootInput, path);
        return getGithubContributors(gitSource, allContributors, filePath);
    };

    return getGithubContributorsFunction;
}

async function getAllContributors(httpClientByToken: Octokit): Promise<Contributors> {
    try {
        const repoContributors = await getRepoContributors(httpClientByToken);
        const promises: Promise<UserDTO | null>[] = [];

        repoContributors.forEach((contributor: ContributorDTO) => {
            if (contributor.login) {
                promises.push(getRepoUser(httpClientByToken, contributor.login));
            }
        });

        const repoUsers = await Promise.all(promises);
        const users: Users = {};

        repoUsers.forEach((user: UserDTO | null) => {
            if (user) {
                users[user.login] = {
                    name: user.name,
                    email: user.email,
                };
            }
        });

        const contributors: Contributors = {};

        repoContributors.forEach((githubContributor: GithubContributorDTO) => {
            const {login, avatar_url: avatarUrl = ''} = githubContributor;
            if (login) {
                const user = users[login];
                if (user) {
                    contributors[user.email || login] = {
                        avatar: avatarUrl,
                        login: login,
                        name: user.name,
                    };
                }
            }
        });

        return contributors;
    } catch (error) {
        console.log(error);
        log.error(`Getting of contributors has been failed. Error: ${JSON.stringify(error)}`);
        throw error;
    }
}

async function getRepoContributors(octokit: Octokit): Promise<ContributorDTO[]> {
    const {GITHUB_OWNER, GITHUB_REPO} = process.env;
    const {connector} = ArgvService.getConfig();
    const owner = GITHUB_OWNER || connector && connector.gitHub.owner || '';
    const repo = GITHUB_REPO || connector && connector.gitHub.repo || '';

    if (!owner || !repo) {
        log.warn(getMsgСonfigurationMustBeProvided(SourceType.GITHUB));
        return [];
    }

    try {
        const commits = await octokit.request('GET /repos/{owner}/{repo}/contributors', {
            owner,
            repo,
        });

        return commits.data;
    } catch (error) {
        log.warn('Getting contributors for GitHub has been failed. Error: ', error);
        return [];
    }
}

async function getRepoUser(octokit: Octokit, username: string): Promise<UserDTO | null> {
    try {
        const user = await octokit.request('GET /users/{username}', {
            username,
        });

        return user.data as UserDTO;
    } catch (error) {
        log.warn('Getting user for GitHub has been failed. Error: ', error);
        return null;
    }
}

async function getGithubContributors(gitSource: SimpleGit, allContributors: Contributors, filePath: string): Promise<Contributor[]> {
    if (Object.keys(allContributors).length === 0) {
        return [];
    }

    const commits = await getGithubLogs(gitSource, filePath);
    const contributors: Contributor[] = [];

    if (commits) {
        commits.forEach((commit: GithubLogsDTO) => {
            const user = allContributors[commit.author_email];

            if (user) {
                contributors.push(user);
            } else {
                contributors.push({
                    avatar: '',
                    login: commit.author_email,
                    name: commit.author_name,
                });
            }
        });
    }

    return contributors;
}

async function getGithubLogs(gitSource: SimpleGit, filePath: string): Promise<GithubLogsDTO[]> {
    if (!existsSync(filePath)) {
        return [];
    }

    const logs = await gitSource.log({file: filePath});
    return logs.all as unknown as GithubLogsDTO[];
}

export default getGitHubVCSConnector;
