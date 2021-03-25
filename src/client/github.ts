import {Octokit} from '@octokit/core';
import {existsSync} from 'fs';
import {SimpleGit} from 'simple-git';
import {Contributors} from '../models';
import {ContributorDTO, GithubClient, GithubContributorDTO, GithubLogsDTO, YfmConfig} from './models';

function getGithubClient(yfmConfig: YfmConfig): GithubClient {
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

async function getGithubLogs(gitSource: SimpleGit, filePath: string): Promise<Contributors> {
    if (!existsSync(filePath)) {
        return {};
    }

    const logs = await gitSource.log({file: filePath});
    const commits = logs.all as unknown as GithubLogsDTO[];

    const contributors: Contributors = {};

    if (commits) {
        commits.forEach((commit: GithubLogsDTO) => {
            const login = getLoginByEmail(commit.author_email);
            contributors[login] = {
                login: login,
                name: commit.author_name,
                avatar: '',
            };
        });
    }

    return contributors;
}

function getLoginByEmail(email: string): string {
    const regexpLogin = /(.*)(?=@.*)/;

    const match = email.match(regexpLogin);

    if (match && match.length) {
        return match[0];
    }

    return email;
}

export {getGithubClient, getGithubLogs};
