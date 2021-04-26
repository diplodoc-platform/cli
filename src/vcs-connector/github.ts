import log from '@doc-tools/transform/lib/log';
import {Octokit} from '@octokit/core';
import {normalize} from 'path';
import {ArgvService} from '../services';
import {Contributor, Contributors, ContributorsFunction} from '../models';
import {ContributorDTO, FileContributors, GitHubConnectorFields, SourceType, UserDTO, VCSConnector} from './models';
import {ALL_CONTRIBUTORS_HAS_BEEN_GOTTEN} from '../constants';
import {execPromisifyFunction, logger} from '../utils';
import {validateConnectorFields} from './connector-validator';

const contributorsByPath: Map<string, FileContributors> = new Map();

async function getGitHubVCSConnector(): Promise<VCSConnector | undefined> {
    const {contributors} = ArgvService.getConfig();

    const httpClientByToken = getHttpClientByToken();
    if (!httpClientByToken) {
        return;
    }

    if (contributors) {
        await getAllContributorsTocFiles(httpClientByToken);
    }

    return {
        getContributorsByPath: contributors
            ? await getContributorsByPathFunction(httpClientByToken)
            : () => Promise.resolve({} as FileContributors),
        getUserByLogin: (login: string) => getUserByLogin(httpClientByToken, login),
    };
}

function getHttpClientByToken(): Octokit | null {
    const {connector} = ArgvService.getConfig();

    const neededProperties = [GitHubConnectorFields.TOKEN, GitHubConnectorFields.ENDPOINT];
    const validatedFileds = validateConnectorFields(SourceType.GITHUB, neededProperties, connector);

    if (Object.keys(validatedFileds).length === 0) {
        return null;
    }

    const octokit = new Octokit({
        auth: validatedFileds[GitHubConnectorFields.TOKEN],
        baseUrl: validatedFileds[GitHubConnectorFields.ENDPOINT],
    });

    return octokit;
}

async function getAllContributorsTocFiles(httpClientByToken: Octokit): Promise<void> {
    const {rootInput} = ArgvService.getConfig();
    const allContributors = await getAllContributors(httpClientByToken);

    const fullRepoLogString = await execPromisifyFunction(`cd ${rootInput} && git log --pretty=format:"%ae, %an" --name-only`);

    const repoLogs = fullRepoLogString.split('\n\n');

    for (const repoLog of repoLogs) {
        const dataArray = repoLog.split('\n');
        const userData = dataArray[0];
        const [email, authorName] = userData.split(', ');

        const contributorByEmail = allContributors[email];

        let newContributor: Contributors = {};

        if (contributorByEmail) {
            newContributor = {
                [email]: allContributors[email],
            };
        } else {
            newContributor = {
                [email]: {
                    avatar: '',
                    email,
                    login: '',
                    name: authorName,
                },
            };
        }

        const paths = dataArray.splice(1);

        addContributorByPath(paths, newContributor);
    }

    logger.info('', ALL_CONTRIBUTORS_HAS_BEEN_GOTTEN);
}

function addContributorByPath(paths: string[], newContributor: Contributors): void {
    paths.forEach((path: string) => {
        const normalizePath = normalize(`${path.startsWith('/') ? '' : '/'}${path}`);

        if (!contributorsByPath.has(normalizePath)) {
            contributorsByPath.set(normalizePath, {
                contributors: newContributor,
            });
            return;
        }

        const oldContributors = contributorsByPath.get(normalizePath);

        contributorsByPath.set(normalizePath, {
            contributors: {
                ...oldContributors?.contributors,
                ...newContributor,
            },
        });
    });
}

async function getContributorsByPathFunction(httpClientByToken: Octokit): Promise<ContributorsFunction> {
    const allContributors = await getAllContributors(httpClientByToken);

    const getContributorsFunction = async (path: string) => {
        return getContributors(path, allContributors);
    };

    return getContributorsFunction;
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
        const contributors: Contributors = {};

        repoUsers.forEach((user: UserDTO | null) => {
            if (user) {
                const {email, login, name, avatar_url: avatarUrl} = user;
                contributors[email || login] = {
                    avatar: avatarUrl,
                    email,
                    login,
                    name,
                };
            }
        });

        return contributors;
    } catch (error) {
        log.error(`Getting of contributors has been failed. Error: ${JSON.stringify(error)}`);
        throw error;
    }
}

async function getRepoContributors(octokit: Octokit): Promise<ContributorDTO[]> {
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

async function getContributors(path: string, allContributors: Contributors): Promise<FileContributors> {
    if (Object.keys(allContributors).length === 0 || !contributorsByPath.has(path)) {
        return {} as FileContributors;
    }

    return contributorsByPath.get(path) as FileContributors;
}

async function getUserByLogin(octokit: Octokit, userLogin: string): Promise<Contributor | null> {
    const user = await getRepoUser(octokit, userLogin);

    if (!user) {
        return null;
    }

    const {avatar_url: avatar, email, login, name} = user;

    return {
        avatar,
        email,
        login,
        name,
    };
}

export default getGitHubVCSConnector;
