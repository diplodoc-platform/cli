import type {Run} from '~/commands/build';
import {relative, resolve} from 'node:path';
import walkSync from 'walk-sync';
import shell from 'shelljs';

import {ArgvService, TocService} from '../services';
import {convertBackSlashToSlash} from '../utils';

/**
 * Removes all content files that unspecified in toc files or ignored.
 * @return {void}
 */
export async function processExcludedFiles(run: Run) {
    const {ignore} = ArgvService.getConfig();

    const allContentFiles: string[] = walkSync(run.input, {
        directories: false,
        includeBasePath: true,
        globs: ['**/*.md', '**/index.yaml', ...ignore],
        // Ignores service directories like "_includes", "_templates" and etc.
        ignore: ['**/_*/**/*'],
    });
    const navigationPaths = TocService.getNavigationPaths().map((filePath) =>
        convertBackSlashToSlash(resolve(run.input, filePath)),
    );
    const tocSpecifiedFiles = new Set(navigationPaths);
    const excludedFiles = allContentFiles.filter((filePath) => !tocSpecifiedFiles.has(filePath));

    shell.rm('-f', excludedFiles);

    const includedTocPaths = TocService.getIncludedTocPaths().map((filePath) => {
        const relativeTocPath = relative(run.input, filePath);
        const destTocPath = resolve(run.output, relativeTocPath);

        return convertBackSlashToSlash(destTocPath);
    });

    shell.rm('-rf', includedTocPaths);
}
