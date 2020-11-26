import {basename, dirname, extname, resolve, join, relative} from 'path';
import shell from 'shelljs';
import {copyFileSync, writeFileSync} from 'fs';
import {bold} from 'chalk';

import log from '@doc-tools/transform/lib/log';

import {ArgvService, LeadingService, TocService} from '../services';
import {resolveMd2HTML, resolveMd2Md} from '../resolvers';
import {joinSinglePageResults, logger} from '../utils';
import {SinglePageResult} from '../models';
import {SINGLE_PAGE_FOLDER} from '../constants';

const singlePageResults: Record<string, SinglePageResult[]> = {};
const singlePagePaths: Record<string, Set<string>> = {};

/**
 * Processes files of documentation (like index.yaml, *.md)
 * @param {string} tmpInputFolder
 * @param {string} outputBundlePath
 * @return {void}
 */
export function processPages(tmpInputFolder: string, outputBundlePath: string) {
    const {
        input: inputFolderPath,
        output: outputFolderPath,
        outputFormat,
        singlePage,
    } = ArgvService.getConfig();

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
