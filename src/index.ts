import {isMainThread} from 'node:worker_threads';
import {red} from 'chalk';
import dedent from 'ts-dedent';

// eslint-disable-next-line import/order
// test run
import './require';

import * as threads from '~/commands/threads';
import {Program, parse} from '~/commands';
import {MAIN_TIMER_ID} from '~/constants';
import {stats} from '~/core/logger';
import {console, noop} from '~/core/utils';

import './suppress-noisy-logs';

export * from '~/commands';

export const run = async (argv: string[]) => {
    const program = new Program();

    try {
        const args = parse(argv);
        await threads.init(program, argv);
        await program.init(args);
        await program.parse(argv);

        const stat = stats(program.logger);

        if (stat.error || (program.config.strict && stat.warn)) {
            program.report.code = program.report.code || 1;
        }
    } catch (error: unknown) {
        // eslint-disable-next-line no-console
        console.error(error);
        program.report.code = 1;
    } finally {
        await threads.terminate(true).catch(noop);
    }

    return program.report;
};

if (isMainThread && require.main === module) {
    (async () => {
        // eslint-disable-next-line no-console
        console.time(MAIN_TIMER_ID);

        if (global.VERSION) {
            // eslint-disable-next-line no-console
            console.log(`Using v${global.VERSION} version`);
        }

        const report = await run(process.argv);

        // eslint-disable-next-line no-console
        console.timeEnd(MAIN_TIMER_ID);

        if (report.code) {
            // eslint-disable-next-line no-console
            console.log(
                red(dedent`
                        ================================
                        YFM build completed with ERRORS!
                        ================================
                    `),
            );
        }

        process.exit(report.code);
    })();
}
