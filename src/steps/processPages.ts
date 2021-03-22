import {basename, dirname, extname, resolve, join, relative} from 'path';
import shell from 'shelljs';
import {copyFileSync, writeFileSync} from 'fs';
import {bold} from 'chalk';

import log from '@doc-tools/transform/lib/log';

import {ArgvService, LeadingService, TocService} from '../services';
import {resolveMd2HTML, resolveMd2Md} from '../resolvers';
import {joinSinglePageResults, logger} from '../utils';
import {Contributor, Contributors, SinglePageResult} from '../models';
import {SINGLE_PAGE_FOLDER} from '../constants';
import {Client, ContributorDTO} from '../client/models';

const singlePageResults: Record<string, SinglePageResult[]> = {};
const singlePagePaths: Record<string, Set<string>> = {};

// Processes files of documentation (like index.yaml, *.md)
export async function processPages(tmpInputFolder: string, outputBundlePath: string, client: Client): Promise<void> {

    const {
        input: inputFolderPath,
        output: outputFolderPath,
        outputFormat,
        singlePage,
    } = ArgvService.getConfig();

    const allContributors = await getAllContributors(client);
    const contributorsExist = Object.getOwnPropertyNames(allContributors);

    for (const pathToFile of TocService.getNavigationPaths()) {
        const pathToDir: string = dirname(pathToFile);
        const filename: string = basename(pathToFile);
        const fileExtension: string = extname(pathToFile);
        const fileBaseName: string = basename(filename, fileExtension);
        const outputDir = resolve(outputFolderPath, pathToDir);
        const resolvedPathToFile = resolve(inputFolderPath, pathToFile);

        const outputFileName = `${fileBaseName}.${outputFormat}`;
        const outputPath: string = resolve(outputDir, outputFileName);

        let outputSinglePageDir, outputSinglePageFileDir;
        if (outputFormat === 'md' && singlePage) {
            outputSinglePageDir = resolve(TocService.getTocDir(outputPath), SINGLE_PAGE_FOLDER);
            outputSinglePageFileDir = resolve(outputSinglePageDir, pathToDir);
        }

        logger.proc(resolvedPathToFile.replace(tmpInputFolder, ''));

        try {
            let outputFileContent = '';

            shell.mkdir('-p', outputDir);
            if (outputSinglePageFileDir) {
                shell.mkdir('-p', outputSinglePageFileDir);
            }

            if (fileBaseName === 'index' && fileExtension === '.yaml') {
                LeadingService.filterFile(pathToFile);
            }

            if (outputFormat === 'md') {
                if (fileExtension === '.yaml') {
                    const from = resolvedPathToFile;
                    const to = resolve(outputDir, filename);

                    copyFileSync(from, to);
                    continue;
                }

                outputFileContent = resolveMd2Md({inputPath: pathToFile, outputPath: outputDir});

                if (contributorsExist) {
                    const fileContributors = await client.getLogsByPath(pathToFile);
                    outputFileContent = await addMetadata(outputFileContent, allContributors, fileContributors);
                }

                if (outputSinglePageFileDir &&
                    outputSinglePageDir &&
                    !(singlePagePaths[outputSinglePageDir] && singlePagePaths[outputSinglePageDir].has(pathToFile))
                ) {
                    const outputSinglePageContent = resolveMd2Md({inputPath: pathToFile, outputPath: outputSinglePageFileDir, singlePage});

                    const absolutePathToFile = resolve(outputFolderPath, pathToFile);
                    const relativePathToOriginalFile = relative(outputSinglePageDir, absolutePathToFile);

                    singlePageResults[outputSinglePageDir] = singlePageResults[outputSinglePageDir] || [];
                    singlePageResults[outputSinglePageDir].push({
                        path: relativePathToOriginalFile,
                        content: outputSinglePageContent,
                    });

                    singlePagePaths[outputSinglePageDir] = singlePagePaths[outputSinglePageDir] || new Set();
                    singlePagePaths[outputSinglePageDir].add(pathToFile);
                }
            }

            if (outputFormat === 'html') {
                if (fileExtension !== '.yaml' && fileExtension !== '.md') {
                    const from = resolvedPathToFile;
                    const to = resolve(outputDir, filename);

                    copyFileSync(from, to);
                    continue;
                }

                outputFileContent = resolveMd2HTML({
                    inputPath: pathToFile,
                    outputBundlePath,
                    fileExtension,
                    outputPath,
                    filename,
                });
            }

            writeFileSync(outputPath, outputFileContent);
        } catch (e) {
            console.log(e);
            log.error(` No such file or has no access to ${bold(resolvedPathToFile)}`);
        }

        if (outputSinglePageDir && outputSinglePageDir) {
            const singlePageFn = join(outputSinglePageDir, 'index.md');
            const content = joinSinglePageResults(singlePageResults[outputSinglePageDir]);

            writeFileSync(singlePageFn, content);
        }
    }
}

async function getAllContributors(client: Client): Promise<Contributors> {
    try {
        const repoContributors = await client.repoClient.getRepoContributors();

        const contributors: Contributors = {};

        repoContributors.forEach((contributor: ContributorDTO) => {
            const {login, avatar = ''} = contributor;
            if (login) {
                contributors[login] = {
                    avatar,
                    login,
                    name: '',
                };
            }
        });

        return contributors;
    } catch (error) {
        console.log(error);
        log.error(`Getting contributors was failed. Error: ${JSON.stringify(error)}`);
        throw error;
    }
}

async function addMetadata(fileContent: string, allContributors: Contributors, fileContributors: Contributors): Promise<string> {
    // Search by format:
    // ---
    // metaName1: metaValue1
    // metaName2: meta value2
    // incorrectMetadata
    // ---
    const regexpMetadata = '(?<=-{3}\\r\\n)((.*\\r\\n)*)(?=-{3}\\r\\n)';
    // Search by format:
    // ---
    // main content 123
    const regexpFileContent = '---((.*\\r\\n)*)';
    const regexpParseFileContent = new RegExp(`${regexpMetadata}${regexpFileContent}`, 'gm');
    const matches = regexpParseFileContent.exec(fileContent);

    const contributorsValue = await getFileContributors(allContributors, fileContributors);

    if (matches && matches.length > 0) {
        const [, fileMetadata, , fileMainContent] = matches;

        return `${getUpdatedMetadata(contributorsValue, fileMetadata)}${fileMainContent}`;
    }

    return `${getUpdatedMetadata(contributorsValue)}${fileContent}`;
}

async function getFileContributors(allContributors: Contributors, fileContributors: Contributors): Promise<string> {
    const contributors: Contributor[] = [];

    Object.keys(fileContributors).forEach((login: string) => {
        if (allContributors[login]) {
            contributors.push({
                ...fileContributors[login],
                ...allContributors[login],
            });
        }
    });

    return `contributors: ${JSON.stringify(contributors)}`;
}

function getUpdatedMetadata(metaContributorsValue: string, defaultMetadata = ''): string {
    const metadataСarriage = '\r\n';
    const metadataBorder = `---${metadataСarriage}`;

    const newMetadata = `${defaultMetadata}${metadataСarriage}${metaContributorsValue}${metadataСarriage}`;

    return `${metadataBorder}${newMetadata}${metadataBorder}`;
}
