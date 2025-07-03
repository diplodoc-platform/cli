import {isMainThread} from 'node:worker_threads';
import {red} from 'chalk';
import dedent from 'ts-dedent';

import './require';

import * as threads from '~/commands/threads';
import {Program, parse} from '~/commands';
import {stats} from '~/core/logger';

export * from '~/commands';

const MAIN_TIMER_ID = 'Build time';

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
        await threads.terminate(true);
    }

    return program.report;
};

if (isMainThread && require.main === module) {
    (async () => {
        // eslint-disable-next-line no-console
        console.time(MAIN_TIMER_ID);

        if (typeof VERSION !== 'undefined' && process.env.NODE_ENV !== 'test') {
            // eslint-disable-next-line no-console
            console.log(`Using v${VERSION} version`);
        }

        const report = await run(process.argv);

        if (process.env.NODE_ENV !== 'test') {
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
        }

        process.exit(report.code);
    })();
}
