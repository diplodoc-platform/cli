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

async function getAuthorDetails(vcsConnector: VCSConnector, authorLogin: string): Promise<string | null> {
    const user = await vcsConnector.getUserByLogin(authorLogin);

    if (user) {
        return JSON.stringify(user).replace(/"/g, '\'');
    }

    return null;
}

export {
    updateAuthorMetadataString,
    getAuthorDetails,
};
