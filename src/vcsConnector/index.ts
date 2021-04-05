import {join} from 'path';
import simpleGit, {SimpleGit} from 'simple-git';
import {ContributorsFunction} from '../models';
import {getAllContributors, getGithubVCSConnector, getGithubContributors} from './github';
import {VCSConnector, VCSConnectorOptions, RepoVCSConnector, SourceType} from './models';
import {ArgvService} from '../services';

async function getVCSConnector(rootPath: string, options: VCSConnectorOptions): Promise<VCSConnector> {
    const {type} = ArgvService.getConfig();
    const repoType = process.env.TYPE || type || '';

    let vcsConnector;

    switch (repoType) {
        case SourceType.GITHUB:
            vcsConnector = getGithubVCSConnector();
            return {
                getContributorsByPath: await getGithubContributorsByPathFunction(rootPath, vcsConnector, options),
            };
        default:
            vcsConnector = getGithubVCSConnector();
            return {
                getContributorsByPath: await getGithubContributorsByPathFunction(rootPath, vcsConnector, options),
            };
    }
}

async function getGithubContributorsByPathFunction(rootPath: string, vcsConnector: RepoVCSConnector, options: VCSConnectorOptions): Promise<ContributorsFunction> {
    const gitSource: SimpleGit = simpleGit(rootPath, {binary: 'git'});
    const allContributors = options.isContributorsExist ? await getAllContributors(vcsConnector) : {};

    const getGithubContributorsFunction = async (path: string) => {
        const filePath = join(rootPath, path);
        return getGithubContributors(gitSource, allContributors, filePath);
    };

    return getGithubContributorsFunction;
}

export {getVCSConnector};
