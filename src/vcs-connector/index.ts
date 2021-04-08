import {ArgvService} from '../services';
import getGitHubVCSConnector from './github';
import {VCSConnector, SourceType} from './models';

export async function getVCSConnector(): Promise<VCSConnector | null> {
    const {connector} = ArgvService.getConfig();
    const connectorType = process.env.VCS_CONNECTOR_TYPE || connector && connector.type;

    switch (connectorType) {
        case SourceType.GITHUB:
            return getGitHubVCSConnector();
        default:
            return null;
    }
}
