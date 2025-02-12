import GithubConnector from './github';
import {BuildConfig, Run} from '~/commands/build';
import {SourceType} from '~/vcs-connector/connector-models';
import {LogCollector} from '~/reCli/utils/logger';
import {legacyConfig as legacyConfigFn} from '~/commands/build/legacy-config';

interface GetVcsConnectorProps {
    options: BuildConfig;
    cwd: string;
    logger: LogCollector;
    run: Run;
}

export function getVcsConnector(props: GetVcsConnectorProps) {
    const {run} = props;
    const legacyConfig = legacyConfigFn(run);
    let connector = null;
    switch (legacyConfig.connector?.type) {
        case SourceType.GITHUB: {
            connector = new GithubConnector(props);
            break;
        }
    }
    return connector;
}
