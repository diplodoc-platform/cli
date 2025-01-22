import {Octokit} from '@octokit/core';

export type GithubConfig = {
    owner: string;
    repo: string;
    token: string;
    endpoint: string;
};

export class GithubClient {
    private config: GithubConfig;

    private octokit: Octokit;

    constructor(config: GithubConfig) {
        this.config = config;
        this.octokit = new Octokit({
            auth: this.config.token,
            baseUrl: this.config.endpoint,
        });
    }

    async getRepoUser(username: string) {
        const user = await this.octokit.request('GET /users/{username}', {
            username,
        });

        return user.data;
    }

    async getCommitInfo(ref: string) {
        const {owner, repo} = this.config;
        const commit = await this.octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
            owner,
            repo,
            ref,
        });

        return commit.data;
    }
}
