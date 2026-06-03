import {bold} from 'chalk';
import dedent from 'ts-dedent';

import {option} from '~/core/config';

const buildStats = option({
    flags: '--build-stats',
    desc: dedent`
        Output a build stats file (${bold('yfm-build-stats.json')}) with timing,
        environment info and counters. Intended for diagnostics, CI dashboards
        and regression detection.

        Enabled by default for ${bold('--output-format=md')} builds; disabled
        otherwise. Use ${bold('--no-build-stats')} to opt out.
    `,
});

export const options = {
    buildStats,
};
