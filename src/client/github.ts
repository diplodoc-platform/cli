import log from '@doc-tools/transform/lib/log';
import {Octokit} from '@octokit/core';
import {existsSync} from 'fs';
import {SimpleGit} from 'simple-git';
import {Contributors} from '../models';
import {ContributorDTO, RepoClient, GithubContributorDTO, GithubLogsDTO, YfmConfig} from './models';

function getGithubClient(yfmConfig: YfmConfig): RepoClient {
    const httpClientByToken = getHttpClientByToken(yfmConfig);

    return {
        getRepoContributors: async () => getRepoContributors(httpClientByToken, yfmConfig),
    };
}

function getHttpClientByToken(yfmConfig: YfmConfig): Octokit {
    const {TOKEN, BASE_URL} = process.env;
    const token = TOKEN || yfmConfig.token || '';
    const endpoint = BASE_URL || yfmConfig.endpoint || '';

    const octokit = new Octokit({auth: token, baseUrl: endpoint});

    return octokit;
}

async function getRepoContributors(octokit: Octokit, yfmConfig: YfmConfig): Promise<ContributorDTO[]> {
    const {OWNER, REPO} = process.env;
    const owner = OWNER || yfmConfig.owner || '';
    const repo = REPO || yfmConfig.repo || '';

    const commits = await octokit.request('GET /repos/{owner}/{repo}/contributors', {
        owner,
        repo,
    });

    const contributors: ContributorDTO[] = [];

    commits.data.forEach((githubContributor: GithubContributorDTO) => {
        contributors.push({
            avatar: githubContributor.avatar_url,
            login: githubContributor.login,
        });
    });

    return contributors;
}

async function getGithubContributors(gitSource: SimpleGit, allContributors: Contributors, filePath: string): Promise<Contributors> {
    if (Object.keys(allContributors).length === 0) {
        return {};
    }

    const commits = await getGithubLogs(gitSource, filePath);
    const contributors: Contributors = {};

    if (commits) {
        commits.forEach((commit: GithubLogsDTO) => {
            const login = getLoginByEmail(commit.author_email);
            if (allContributors[login]) {
                contributors[login] = {
                    login,
                    name: commit.author_name,
                    avatar: allContributors[login].avatar || '',
                };
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

function getLoginByEmail(email: string): string {
    const [login] = email.split('@');

    return login || email;
}

async function getAllContributors(client: RepoClient): Promise<Contributors> {
    try {
        const repoContributors = await client.getRepoContributors();

        const contributors: Contributors = {};

        repoContributors.forEach((contributor: ContributorDTO) => {
            const {login, avatar = ''} = contributor;
            if (login) {
                contributors[login] = {
                    login,
                    avatar,
                    name: '',
                };
            }
        });

        return contributors;
    } catch (error) {
        console.log(error);
        log.error(`Getting contributors was failed. Error: ${JSON.stringify(error)}`);
        throw error;
    }
}

export {getGithubClient, getGithubContributors, getAllContributors};
