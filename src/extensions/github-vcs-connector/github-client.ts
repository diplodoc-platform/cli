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
    repository: Hash<CommitInfo>;
};

type CommitInfo = {
    oid: string;
    author: {
        user: Contributor | null;
    };
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
        const parts = splitRequests(queries, 25);
        const requests = parts.map(
            (part) => `
            query getCommits($owner: String!, $repo: String!) {
              repository(owner: $owner, name: $repo) {
                ${part.join('\n')}
              }
            }
        `,
        );

        try {
            const results = (await Promise.all(
                requests.map((request) => this.octokit.graphql(request, {owner, repo})),
            )) as CommitsInfo[];

            return joinResults(results);
        } catch {
            return [];
        }
    }
}

function splitRequests(array: unknown[], slice: number) {
    array = array.slice();

    const parts = [];
    while (array.length) {
        parts.push(array.splice(0, slice));
    }

    return parts;
}

function joinResults(results: CommitsInfo[]) {
    return results.reduce((result, part) => {
        return result.concat(Object.values(part.repository).filter(Boolean));
    }, [] as CommitInfo[]);
}
