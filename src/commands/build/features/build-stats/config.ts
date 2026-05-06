import {bold} from 'chalk';
import dedent from 'ts-dedent';

import {option} from '~/core/config';

const buildStats = option({
    flags: '--build-stats',
    desc: dedent`
        Output a build stats file (${bold('yfm-build-stats.json')}) with timing,
        environment info and counters. Intended for diagnostics, CI dashboards
        and regression detection.
    `,
});

export const options = {
    buildStats,
};
