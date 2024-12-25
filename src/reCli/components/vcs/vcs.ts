import GithubConnector from './github';
import {BuildConfig, Run} from '~/commands/build';
import {SourceType} from '~/vcs-connector/connector-models';
import {logger} from '~/utils';

interface GetVcsConnectorProps {
    options: BuildConfig;
    cwd: string;
    logger: typeof logger;
    run: Run;
}

export function getVcsConnector(props: GetVcsConnectorProps) {
    const {run} = props;
    let connector = null;
    switch (run.legacyConfig.connector?.type) {
        case SourceType.GITHUB: {
            connector = new GithubConnector(props);
            break;
        }
    }
    return connector;
}
