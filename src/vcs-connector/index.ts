import {ArgvService} from '../services';
import getGitHubVCSConnector from './github';
import {SourceType, VCSConnector} from './connector-models';

export async function getVCSConnector(): Promise<VCSConnector | undefined> {
    const {connector} = ArgvService.getConfig();
    const connectorType = process.env.VCS_CONNECTOR_TYPE || (connector && connector.type);

    switch (connectorType) {
        case SourceType.GITHUB:
            return getGitHubVCSConnector();
        default:
            return undefined;
    }
}
