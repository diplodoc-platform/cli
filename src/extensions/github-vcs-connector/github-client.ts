import type {Contributor} from '@diplodoc/cli/lib/vcs';

import {Octokit} from '@octokit/core';

export type GithubConfig = {
    vcs: {
        owner: string;
        repo: string;
        token: string;
        endpoint: string;
    };
};

type CommitsInfo = {
    repository: Hash<{
        oid: string;
        author: {
            user: Contributor;
        };
    }>;
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

    async getCommitsInfo(refs: string[]) {
        if (!refs.length) {
            return [];
        }

        const {owner, repo} = this.config.vcs;
        const fields = 'oid, author {user {login,name,url,avatar: avatarUrl}}';
        const queries = refs.map(
            (ref) => `sha${ref}: object(expression: "${ref}") {... on Commit {${fields}}}`,
        );
        const request = `
            query getCommits($owner: String!, $repo: String!) {
              repository(owner: $owner, name: $repo) {
                ${queries.join('\n')}
              }
            }
        `;

        try {
            const result: CommitsInfo = await this.octokit.graphql(request, {owner, repo});

            return Object.values(result.repository);
        } catch {
            return [];
        }
    }
}
