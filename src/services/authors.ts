import {Contributor} from '../models';
import {VCSConnector} from '../vcs-connector/connector-models';

async function updateAuthorMetadataStringByAuthorData(
    authorLogin: string | object,
    vcsConnector?: VCSConnector,
): Promise<Contributor | null> {
    if (!vcsConnector) {
        return null;
    }

    const user = await getAuthorDetails(vcsConnector, authorLogin);

    if (user) {
        return user;
    }

    return null;
}

async function updateAuthorMetadataStringByFilePath(
    filePath: string,
    vcsConnector?: VCSConnector,
): Promise<Contributor | null> {
    if (!vcsConnector) {
        return null;
    }

    const user = vcsConnector.getExternalAuthorByPath(filePath);

    if (user) {
        return user;
    }

    return null;
}

async function getAuthorDetails(
    vcsConnector: VCSConnector,
    author: string | object,
): Promise<Contributor | null> {
    if (typeof author === 'object') {
        return author as Contributor;
    }

    try {
        return JSON.parse(author);
    } catch {
        const user = await vcsConnector.getUserByLogin(author);

        if (user) {
            return user;
        }

        return null;
    }
}

export {
    updateAuthorMetadataStringByAuthorData as updateAuthorMetadataStringByAuthorLogin,
    updateAuthorMetadataStringByFilePath,
    getAuthorDetails,
};
