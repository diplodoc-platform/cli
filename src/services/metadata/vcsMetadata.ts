import type {Meta} from '~/core/meta';
import type {Run} from '~/commands/build';

import {join, relative} from 'node:path';

import {getAuthorDetails} from './authors';
import {getFileContributors, getFileIncludes} from './contributors';

const getModifiedTimeISOString = async (run: Run, path: RelativePath, content: string) => {
    const mtimes = [];
    const files = [path]
        .concat(await getFileIncludes(run, path, content))
        .map((path) => join(run.input, path));

    for (const file of files) {
        const realpath = await run.realpath(join(run.input, file), false);
        const path = relative(run.originalInput, realpath);
        const mtime = await run.vcs.getModifiedTimeByPath(path);

        if (typeof mtime === 'number') {
            mtimes.push(mtime);
        }
    }

    if (!mtimes.length) {
        return undefined;
    }

    return new Date(Math.max(...mtimes) * 1000).toISOString();
};

export const resolveVCSFrontMatter = async (
    run: Run,
    path: RelativePath,
    meta: Meta,
    content: string,
) => {
    if (!run.vcs.enabled) {
        return {};
    }

    const [author, contributors, updatedAt] = await Promise.all([
        getAuthorDetails(run, path, meta?.author),
        getFileContributors(run, path, content),
        getModifiedTimeISOString(run, path, content),
    ]);

    const authorToSpread = author ? {author} : undefined;
    const contributorsToSpread = contributors.length > 0 ? {contributors} : undefined;
    const updatedAtToSpread = updatedAt ? {updatedAt} : undefined;

    return {
        ...authorToSpread,
        ...contributorsToSpread,
        ...updatedAtToSpread,
    };
};
