import os from 'os';

import {logger, replaceDoubleToSingleQuotes} from '../utils';
import {REGEXP_AUTHOR, REGEXP_CONTRIBUTORS} from '../constants';
import {VCSConnector} from '../vcs-connector/connector-models';
import {isEarlier, parseDataFromJSONString} from './utils';
import {Contributor} from '../models';


export function getContributorArrayFromMetadata(metadata: string[], filePath = '') {
    const contributors: Contributor[] = [];

    for (const meta of metadata) {
        const matchContributors = meta.match(REGEXP_CONTRIBUTORS);
        try {
            if (matchContributors) {
                contributors.push(...parseDataFromJSONString(matchContributors[0]));
            }
        } catch (err) {
            logger.warn(filePath, JSON.stringify(err));
        }
    }

    return contributors;
}


async function updateAuthorMetadataString(
    fileMetadata = '',
    vcsConnector?: VCSConnector,
    newMetadatas: string[] = [],
): Promise<string> {
    if (!vcsConnector) {
        return fileMetadata;
    }

    const matchAuthor = fileMetadata.match(REGEXP_AUTHOR);

    if (matchAuthor && matchAuthor?.length > 0) {
        const authorLogin = matchAuthor[0];
        const user = await getAuthorDetails(vcsConnector, authorLogin);

        if (user) {
            return fileMetadata.replace(authorLogin, user);
        }
    }

    const contributors = getContributorArrayFromMetadata(newMetadatas);

    if (contributors.length && !matchAuthor) {
        contributors.sort((a, b) => isEarlier(a.date, b.date) ? -1 : 1);
        const user = await getAuthorDetails(vcsConnector, contributors[0]);

        if (user) {
            return `${fileMetadata}${os.EOL}author: ${user}`;
        }
    }

    return fileMetadata;
}

async function getAuthorDetails(vcsConnector: VCSConnector, author: string | object): Promise<string | null> {
    if (typeof author === 'object') {
        // Avoiding problems when adding to html markup
        return replaceDoubleToSingleQuotes(JSON.stringify(author));
    }

    try {
        JSON.parse(author);
        return replaceDoubleToSingleQuotes(author);
    } catch {
        const user = await vcsConnector.getUserByLogin(author);

        if (user) {
            return replaceDoubleToSingleQuotes(JSON.stringify(user));
        }

        return null;
    }
}

export {
    updateAuthorMetadataString,
    getAuthorDetails,
};
