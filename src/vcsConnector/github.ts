import log from '@doc-tools/transform/lib/log';
import {Octokit} from '@octokit/core';
import {existsSync} from 'fs';
import {SimpleGit} from 'simple-git';
import {ArgvService} from '../services';
import {Contributor, Contributors, Users} from '../models';
import {ContributorDTO, RepoVCSConnector, GithubContributorDTO, GithubLogsDTO, UserDTO} from './models';

function getGithubVCSConnector(): RepoVCSConnector {
    const httpClientByToken = getHttpClientByToken();

    return {
        getRepoContributors: async () => getContributors(httpClientByToken),
    };
}

function getHttpClientByToken(): Octokit {
    const {GITHUB_TOKEN, GITHUB_BASE_URL} = process.env;
    const {github} = ArgvService.getConfig();
    const token = GITHUB_TOKEN || github && github.token || '';
    const endpoint = GITHUB_BASE_URL || github && github.endpoint || '';

    const octokit = new Octokit({auth: token, baseUrl: endpoint});

    return octokit;
}

async function getContributors(octokit: Octokit): Promise<Contributors> {
    const repoContributors = await getRepoContributors(octokit);
    const promises: Promise<UserDTO | null>[] = [];

    repoContributors.forEach((contributor: ContributorDTO) => {
        if (contributor.login) {
            promises.push(getRepoUser(octokit, contributor.login));
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
        /* eslint-disable camelcase */
        const {login, avatar_url = ''} = githubContributor;
        if (login) {
            const user = users[login];
            contributors[user.email || login] = {
                avatar: avatar_url,
                login: login,
                name: user.name,
            };
        }
    });

    return contributors;
}

async function getRepoContributors(octokit: Octokit): Promise<ContributorDTO[]> {
    const {GITHUB_OWNER, GITHUB_REPO} = process.env;
    const {github} = ArgvService.getConfig();
    const owner = GITHUB_OWNER || github && github.owner || '';
    const repo = GITHUB_REPO || github && github.repo || '';

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
    const commits = logs.all as unknown as GithubLogsDTO[];

    return commits;
}

async function getAllContributors(repoVCSConnector: RepoVCSConnector): Promise<Contributors> {
    try {
        const repoContributors = await repoVCSConnector.getRepoContributors();

        return repoContributors;
    } catch (error) {
        console.log(error);
        log.error(`Getting of contributors has been failed. Error: ${JSON.stringify(error)}`);
        throw error;
    }
}

export {getGithubVCSConnector, getGithubContributors, getAllContributors};
