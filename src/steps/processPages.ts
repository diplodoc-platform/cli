import {basename, dirname, extname, resolve} from 'path';
import shell from 'shelljs';
import {copyFileSync, writeFileSync} from 'fs';
import {bold} from 'chalk';

import log from '@doc-tools/transform/lib/log';

import {ArgvService, LeadingService, TocService} from '../services';
import {resolveMd2HTML, resolveMd2Md} from '../resolvers';
import {logger} from '../utils';

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
    } = ArgvService.getConfig();

    for (const pathToFile of TocService.getNavigationPaths()) {
        const pathToDir: string = dirname(pathToFile);
        const filename: string = basename(pathToFile);
        const fileExtension: string = extname(pathToFile);
        const fileBaseName: string = basename(filename, fileExtension);
        const outputDir: string = resolve(outputFolderPath, pathToDir);
        const resolvedPathToFile = resolve(inputFolderPath, pathToFile);

        const outputFileName = `${fileBaseName}.${outputFormat}`;
        const outputPath: string = resolve(outputDir, outputFileName);

        logger.proc(resolvedPathToFile.replace(tmpInputFolder, ''));

        try {
            let outputFileContent = '';

            shell.mkdir('-p', outputDir);

            if (outputFormat === 'md') {
                if (fileExtension === '.yaml') {
                    const from = resolvedPathToFile;
                    const to = resolve(outputDir, filename);

                    copyFileSync(from, to);
                    continue;
                }

                outputFileContent = resolveMd2Md(pathToFile, outputDir);
            }

            if (outputFormat === 'html') {
                if (fileExtension !== '.yaml' && fileExtension !== '.md') {
                    const from = resolvedPathToFile;
                    const to = resolve(outputDir, filename);

                    copyFileSync(from, to);
                    continue;
                }

                const isLeadingPage = fileBaseName === 'index' && fileExtension === '.yaml';
                const filteredContent = () => LeadingService.getContentFilteredFile(pathToFile);

                const resolverOptions = {
                    inputPath: pathToFile,
                    outputBundlePath,
                    fileExtension,
                    outputPath,
                    filename,
                };

                outputFileContent = isLeadingPage
                    ? resolveMd2HTML(resolverOptions, filteredContent())
                    : resolveMd2HTML(resolverOptions);
            }

            writeFileSync(outputPath, outputFileContent);
        } catch {
            log.error(`No such file or has no access to ${bold(resolvedPathToFile)}`);
        }
    }
}
