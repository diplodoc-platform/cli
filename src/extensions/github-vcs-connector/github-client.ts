import {Octokit} from '@octokit/core';

export type GithubConfig = {
    vcs: {
        owner: string;
        repo: string;
        token: string;
        endpoint: string;
    };
};

type CommitInfo = {
    commit: {
        author: {
            name: string;
            email: string;
        } | null;
    };
    author: {
        login: string;
        html_url: string;
        avatar_url: string;
    } | null;
};

export class GithubClient {
    private config: GithubConfig;

    private octokit: Octokit;

    constructor(config: GithubConfig) {
        this.config = config;
        this.octokit = new Octokit({
            auth: this.config.vcs.token,
            baseUrl: this.config.vcs.endpoint,
        });
    }

    async getRepoUser(username: string) {
        const user = await this.octokit.request('GET /users/{username}', {
            username,
        });

        return user.data;
    }

    async getCommitInfo(ref: string) {
        const {owner, repo} = this.config.vcs;
        const commit = await this.octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
            owner,
            repo,
            ref,
        });

        return commit.data as CommitInfo;
    }
}
