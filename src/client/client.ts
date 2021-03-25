import fs from 'fs';
import yaml from 'js-yaml';
import log from '@doc-tools/transform/lib/log';
import {join, resolve} from 'path';
import simpleGit, {SimpleGit} from 'simple-git';
import {LogFunction} from '../models';
import {getGithubClient, getGithubLogs} from './github';
import {Client, SourceType, YfmConfig} from './models';

function getClient(rootPath: string, pathToYfmConfig: string): Client {
    const yfmConfig = getYfmConfig(pathToYfmConfig);
    const type = process.env.TYPE || yfmConfig.type || '';

    switch (type) {
        case SourceType.github:
            return {
                getLogsByPath: getGithubLogsFunction(rootPath),
                repoClient: getGithubClient(yfmConfig),
            };
        default:
            return {
                getLogsByPath: getGithubLogsFunction(rootPath),
                repoClient: getGithubClient(yfmConfig),
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

function getGithubLogsFunction(rootPath: string): LogFunction {
    const gitSource: SimpleGit = simpleGit(rootPath, {binary: 'git'});

    const getLogsFunction = async (path: string) => {
        const filePath = join(rootPath, path);
        return getGithubLogs(gitSource, filePath);
    };

    return getLogsFunction;
}

export {getClient};
