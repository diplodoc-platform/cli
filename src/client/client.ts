import fs from 'fs';
import yaml from 'js-yaml';
import log from '@doc-tools/transform/lib/log';
import {join, resolve} from 'path';
import simpleGit, {SimpleGit} from 'simple-git';
import {ContributorsFunction} from '../models';
import {getAllContributors, getGithubClient, getGithubContributors} from './github';
import {Client, ClientOptions, RepoClient, SourceType, YfmConfig} from './models';

async function getClient(rootPath: string, pathToYfmConfig: string, options: ClientOptions): Promise<Client> {
    const yfmConfig = getYfmConfig(pathToYfmConfig);
    const type = process.env.TYPE || yfmConfig.type || '';

    let client;

    switch (type) {
        case SourceType.gitHub:
            client = getGithubClient(yfmConfig);
            return {
                getContributorsByPath: await getGithubContributorsByPathFunction(rootPath, client, options),
            };
        default:
            client = getGithubClient(yfmConfig);
            return {
                getContributorsByPath: await getGithubContributorsByPathFunction(rootPath, client, options),
            };
    }
}

function getYfmConfig(pathToYfmConfig: string): YfmConfig {
    const content = fs.readFileSync(resolve(pathToYfmConfig), 'utf8');
    let yfmConfig = yaml.load(content);

    if (!yfmConfig || typeof yfmConfig !== 'object') {
        log.error('Invalid yfm configuration');
        yfmConfig = {};
    }

    return yfmConfig as YfmConfig;
}

async function getGithubContributorsByPathFunction(rootPath: string, client: RepoClient, options: ClientOptions): Promise<ContributorsFunction> {
    const gitSource: SimpleGit = simpleGit(rootPath, {binary: 'git'});
    const allContributors = options.isContributorsExist ? await getAllContributors(client) : {};

    const getGithubContributorsFunction = async (path: string) => {
        const filePath = join(rootPath, path);
        return getGithubContributors(gitSource, allContributors, filePath);
    };

    return getGithubContributorsFunction;
}

export {getClient};
