import {replaceDoubleToSingleQuotes, сarriage} from '../utils';
import {REGEXP_AUTHOR} from '../constants';
import {VCSConnector} from '../vcs-connector/connector-models';

async function updateAuthorMetadataString(
    defaultMetadata = '',
    vcsConnector?: VCSConnector,
    filePath?: string | null,
): Promise<string> {
    if (!vcsConnector) {
        return defaultMetadata;
    }

    const matchAuthor = defaultMetadata.match(REGEXP_AUTHOR);

    if (matchAuthor && matchAuthor?.length > 0) {
        const authorLogin = matchAuthor[0];
        const user = await getAuthorDetails(vcsConnector, authorLogin);

        if (user) {
            return defaultMetadata.replace(authorLogin, user);
        }
    } else if (filePath) {
        const user = vcsConnector.getExternalAuthorByPath(filePath);

        if (user) {
            const author = replaceDoubleToSingleQuotes(JSON.stringify(user));
            return `${defaultMetadata}${сarriage}author: ${author}`;
        }
    }

    return defaultMetadata;
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
