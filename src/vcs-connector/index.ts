import type {Run} from '~/commands/build';

import getGitHubVCSConnector from './github';
import {SourceType, VCSConnector} from './connector-models';

export async function getVCSConnector(config: Run['config']): Promise<VCSConnector | undefined> {
    const connectorType = process.env.VCS_CONNECTOR_TYPE || config.vcs.connector?.type;

    switch (connectorType) {
        case SourceType.GITHUB:
            return getGitHubVCSConnector(config);
        default:
            return undefined;
    }
}
