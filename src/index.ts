import type {HookMeta} from '~/core/utils';

import {isMainThread} from 'node:worker_threads';
import * as threads from '~/commands/threads';

import {Program, parse} from '~/commands';
import {errorMessage, own} from '~/core/utils';
import {red} from 'chalk';
import dedent from 'ts-dedent';

export * from '~/commands';

const MAIN_TIMER_ID = 'Build time';

export const run = async (argv: string[]) => {
    if (typeof VERSION !== 'undefined' && process.env.NODE_ENV !== 'test') {
        // eslint-disable-next-line no-console
        console.log(`Using v${VERSION} version`);
    }

    let exitCode = 0;
    try {
        const args = parse(argv);
        const program = new Program();
        await threads.init(program, argv);
        await program.init(args);
        await program.parse(argv);
    } catch (error: unknown) {
        exitCode = 1;

        if (own<HookMeta, 'hook'>(error, 'hook')) {
            const {service, hook, name} = error.hook;
            // eslint-disable-next-line no-console
            console.error(`Intercept error for ${service}.${hook} hook from ${name} extension.`);
        }

        const message = errorMessage(error);
        if (message) {
            // eslint-disable-next-line no-console
            console.error(message);
        }
    }

    await threads.terminate(true);

    return exitCode;
};

if (isMainThread && require.main === module) {
    (async () => {
        // eslint-disable-next-line no-console
        console.time(MAIN_TIMER_ID);

        const exitCode = await run(process.argv);

        if (process.env.NODE_ENV !== 'test') {
            // eslint-disable-next-line no-console
            console.timeEnd(MAIN_TIMER_ID);

            if (exitCode) {
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

        process.exit(exitCode);
    })();
}
