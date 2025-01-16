import type {Run} from '~/commands/build';

import {dirname, join} from 'node:path';

import {own} from '~/utils';
import {REGEXP_INCLUDE_CONTENTS, REGEXP_INCLUDE_FILE_PATH} from '~/constants';
import {Contributor, Contributors} from '~/models';

export async function getFileContributors(
    run: Run,
    path: RelativePath,
    content: string,
): Promise<Contributor[]> {
    const fileContributors = await run.vcs.getContributorsByPath(path);
    let nestedContributors: Contributors = {};

    if (!fileContributors.hasIncludes) {
        nestedContributors = await getContributorsForNestedFiles(run, path, content);
        run.vcs.addNestedContributorsForPath(path, nestedContributors);
    }

    const allContributorsFiles: Contributors = {
        ...fileContributors.contributors,
        ...nestedContributors,
    };

    return Object.values(allContributorsFiles);
}

async function getContributorsForNestedFiles(
    run: Run,
    path: RelativePath,
    content: string,
): Promise<Contributors> {
    const includes = content.match(REGEXP_INCLUDE_CONTENTS);
    if (!includes || includes.length === 0) {
        return {};
    }

    const includesContributors: Contributors[] = [];
    const includesPaths = getIncludesPaths(path, includes);

    for (const includePath of includesPaths) {
        const includeContributors = await run.vcs.getContributorsByPath(includePath);

        let nestedContributors: Contributors = {};

        if (!includeContributors.hasIncludes) {
            try {
                const includeContent = await run.read(join(run.input, includePath));
                nestedContributors = await getContributorsForNestedFiles(
                    run,
                    includePath,
                    includeContent,
                );
                run.vcs.addNestedContributorsForPath(includePath, nestedContributors);
            } catch (error) {
                if (own(error, 'code') && error.code === 'ENOENT') {
                    continue;
                }

                throw error;
            }
        }

        includesContributors.push(includeContributors.contributors);
        includesContributors.push(nestedContributors);
    }

    return Object.assign({}, ...includesContributors);
}

function getIncludesPaths(path: RelativePath, includes: string[]): RelativePath[] {
    const results: Set<RelativePath> = new Set();

    includes.forEach((includeContent: string) => {
        const relativeIncludeFilePath = includeContent.match(REGEXP_INCLUDE_FILE_PATH);

        if (relativeIncludeFilePath && relativeIncludeFilePath.length !== 0) {
            const relativeIncludeFilePathWithoutHash = relativeIncludeFilePath[0].split('#');
            const includeFilePath = join(dirname(path), relativeIncludeFilePathWithoutHash[0]);

            results.add(includeFilePath);
        }
    });

    return [...results];
}

export async function getFileIncludes(run: Run, path: RelativePath, content: string) {
    const results = new Set<RelativePath>();

    const includes = content.match(REGEXP_INCLUDE_CONTENTS);
    if (!includes || includes.length === 0) {
        return [];
    }

    const includesPaths = getIncludesPaths(path, includes);
    for (const includePath of includesPaths) {
        if (results.has(path)) {
            continue;
        }
        results.add(path);

        try {
            const includeContent = await run.read(join(run.input, includePath));
            const includedPaths = await getFileIncludes(run, includePath, includeContent);

            includedPaths.forEach((path) => results.add(path));
        } catch (error) {
            if (own(error, 'code') && error.code === 'ENOENT') {
                continue;
            }

            throw error;
        }
    }

    return [...results];
}
