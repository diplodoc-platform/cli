import {resolve} from 'path';
import walkSync from 'walk-sync';
import shell from 'shelljs';

import {ArgvService, TocService} from '../services';

/**
 * Removes all content files that unspecified in toc files or ignored.
 * @return {void}
 */
export function processExcludedFiles() {
    const {
        input: inputFolderPath,
        ignore,
    } = ArgvService.getConfig();

    const allContentFiles: string[] = walkSync(inputFolderPath, {
        directories: false,
        includeBasePath: false,
        globs: [
            '**/*.md',
            '**/index.yaml',
            ...ignore,
        ],
        // Ignores service directories like "_includes", "_templates" and etc.
        ignore: ['**/_*/**/*'],
    });
    const tocSpecifiedFiles = new Set(TocService.getNavigationPaths());
    const excludedFiles = allContentFiles
        .filter((filePath) => !tocSpecifiedFiles.has(filePath))
        .map((filePath) => resolve(inputFolderPath, filePath));

    shell.rm(excludedFiles);
}
