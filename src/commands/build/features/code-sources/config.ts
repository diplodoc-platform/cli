import {bold} from 'chalk';

import {option} from '~/core/config';

/** Shared with the config hook, which is where the value is made absolute. */
export const DEFAULT_DOWNLOAD_DIR = '.diplodoc/sources';

const sourcesDownloadDir = option({
    flags: '--sources-download-dir <value>',
    desc: `
        Directory downloaded source files are written to.

        Defaults to ${bold('.diplodoc/sources')} in the current directory.
        Keep it out of the input and output directories.

        Files are stored under the resolved commit, so a directory left over from
        an earlier build is reused when it holds the same commit, and ignored
        otherwise. Nothing depends on it surviving between builds.
    `,
    default: DEFAULT_DOWNLOAD_DIR,
});

export const options = {
    sourcesDownloadDir,
};
