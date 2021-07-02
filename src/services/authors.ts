import {REGEXP_AUTHOR} from '../constants';
import {VCSConnector} from '../vcs-connector/connector-models';

async function updateAuthorMetadataString(defaultMetadata = '', vcsConnector?: VCSConnector): Promise<string> {
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
    }

    return defaultMetadata;
}

async function getAuthorDetails(vcsConnector: VCSConnector, author: string | object): Promise<string | null> {
    if (typeof author === 'object') {
        return JSON.stringify(author).replace(/"/g, '\'');
    }

    try {
        JSON.parse(author);
        return author.replace(/"/g, '\'');
    } catch {
        const user = await vcsConnector.getUserByLogin(author);

        if (user) {
            return JSON.stringify(user).replace(/"/g, '\'');
        }

        return null;
    }
}

export {
    updateAuthorMetadataString,
    getAuthorDetails,
};
