import getGitHubVCSConnector from './github';
import {VCSConnector, SourceType} from './models';

export async function getVCSConnector(type?: string): Promise<VCSConnector | undefined> {
    const connectorType = process.env.VCS_CONNECTOR_TYPE || type || '';

    switch (connectorType) {
        case SourceType.GITHUB:
            return getGitHubVCSConnector();
        default:
            return;
    }
}
