import {isMainThread} from 'node:worker_threads';
import {red} from 'chalk';
import dedent from 'ts-dedent';

// eslint-disable-next-line import/order
import './require';

import * as threads from '~/commands/threads';
import {Program, parse, profile} from '~/commands';
import {MAIN_TIMER_ID} from '~/constants';
import {stats} from '~/core/logger';
import {console, noop} from '~/core/utils';

export * from '~/commands';

export const run = async (argv: string[]) => {
    const program = new Program();

    try {
        const args = parse(argv);

        const dump = args.profile ? await profile() : null;
        if (typeof args.profile === 'number' && dump) {
            setTimeout(dump.stop, args.profile * 1000);
        }

        await threads.init(program, argv);
        await program.init(args);
        await program.parse(argv);

        if (args.profile === true && dump) {
            await dump.stop();
        }

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
