import log from '@doc-tools/transform/lib/log';
import {Octokit} from '@octokit/core';
import {ArgvService} from '../../services';
import {GithubContributorDTO, GithubCommitDTO, GitHubConnectorFields, SourceType, GithubUserDTO} from '../connector-models';
import {validateConnectorFields} from '../connector-validator';

async function getRepoContributors(octokit: Octokit): Promise<GithubContributorDTO[]> {
    const {connector} = ArgvService.getConfig();

    const neededProperties = [GitHubConnectorFields.OWNER, GitHubConnectorFields.REPO];
    const validatedFileds = validateConnectorFields(SourceType.GITHUB, neededProperties, connector);

    if (Object.keys(validatedFileds).length === 0) {
        return [];
    }

    try {
        const commits = await octokit.request('GET /repos/{owner}/{repo}/contributors', {
            owner: validatedFileds[GitHubConnectorFields.OWNER],
            repo: validatedFileds[GitHubConnectorFields.REPO],
        });

        return commits.data;
    } catch (error) {
        log.warn('Getting contributors for GitHub has been failed. Error: ', error);
        return [];
    }
}

async function getRepoUser(octokit: Octokit, username: string): Promise<GithubUserDTO | null> {
    try {
        const user = await octokit.request('GET /users/{username}', {
            username,
        });

        return user.data as GithubUserDTO;
    } catch (error) {
        log.warn('Getting user for GitHub has been failed.', {username}, error);
        return null;
    }
}

async function getRepoCommitByHash(httpClientByToken: Octokit, hashCommit: string): Promise<GithubCommitDTO | null> {
    const {connector} = ArgvService.getConfig();

    const neededProperties = [GitHubConnectorFields.OWNER, GitHubConnectorFields.REPO];
    const validatedFileds = validateConnectorFields(SourceType.GITHUB, neededProperties, connector);

    if (Object.keys(validatedFileds).length === 0) {
        return null;
    }

    try {
        const commit = await httpClientByToken.request('GET /repos/{owner}/{repo}/commits/{commit_sha}', {
            owner: validatedFileds[GitHubConnectorFields.OWNER],
            repo: validatedFileds[GitHubConnectorFields.REPO],
            commit_sha: hashCommit,
        });

        return commit.data;
    } catch (error) {
        log.warn('Getting commit by sha has been failed for GitHub. Error: ', error);
        return null;
    }
}

export default {
    getRepoContributors,
    getRepoUser,
    getRepoCommitByHash,
};
