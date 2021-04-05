import log from '@doc-tools/transform/lib/log';
import {Octokit} from '@octokit/core';
import {existsSync} from 'fs';
import {SimpleGit} from 'simple-git';
import {ArgvService} from '../services';
import {Contributors} from '../models';
import {ContributorDTO, RepoVCSConnector, GithubContributorDTO, GithubLogsDTO} from './models';

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

async function getContributors(octokit: Octokit): Promise<ContributorDTO[]> {
    const repoContributors = await getRepoContributors(octokit);

    const contributors: ContributorDTO[] = [];

    repoContributors.forEach((githubContributor: GithubContributorDTO) => {
        contributors.push({
            avatar: githubContributor.avatar_url,
            login: githubContributor.login,
        });
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
        log.warn(error);
        return [];
    }
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

async function getAllContributors(repoVCSConnector: RepoVCSConnector): Promise<Contributors> {
    try {
        const repoContributors = await repoVCSConnector.getRepoContributors();

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
        log.error(`Getting of contributors has been failed. Error: ${JSON.stringify(error)}`);
        throw error;
    }
}

export {getGithubVCSConnector, getGithubContributors, getAllContributors};
