import type {HookMeta} from '~/core/utils';

import {isMainThread} from 'node:worker_threads';
import * as threads from '~/commands/threads';

import {MAIN_TIMER_ID} from '~/constants';
import {Program, parse} from '~/commands';
import {errorMessage, own} from '~/core/utils';

export * from '~/commands';

if (isMainThread && require.main === module) {
    (async () => {
        // eslint-disable-next-line no-console
        console.time(MAIN_TIMER_ID);

        if (typeof VERSION !== 'undefined' && process.env.NODE_ENV !== 'test') {
            // eslint-disable-next-line no-console
            console.log(`Using v${VERSION} version`);
        }

        let exitError;
        let exitCode = 0;
        try {
            const args = parse(process.argv);
            const program = new Program();

            await threads.init(program, args);

            await program.init(args);
            await program.parse(process.argv);
        } catch (error: unknown) {
            exitCode = 1;
            exitError = error;
        }

        if (exitError) {
            if (own<HookMeta, 'hook'>(exitError, 'hook')) {
                const {service, hook, name} = exitError.hook;
                // eslint-disable-next-line no-console
                console.error(
                    `Intercept error for ${service}.${hook} hook from ${name} extension.`,
                );
            }

            const message = errorMessage(exitError);
            if (message) {
                // eslint-disable-next-line no-console
                console.error(message);
            }
        }

        if (process.env.NODE_ENV !== 'test') {
            // eslint-disable-next-line no-console
            console.timeEnd(MAIN_TIMER_ID);
        }

        await threads.terminate(true);
        process.exit(exitCode);
    })();
}
