import type {HookMeta} from '~/core/utils';

import {MAIN_TIMER_ID} from '~/constants';
import {NAME, Program, parse} from '~/commands';
import {errorMessage, own} from '~/core/utils';

export {Program} from '~/commands';

export type {Config, OptionInfo} from '~/core/config';
export {Command, option} from '~/core/config';

if (require.main === module) {
    (async () => {
        // eslint-disable-next-line no-console
        console.time(MAIN_TIMER_ID);

        if (typeof VERSION !== 'undefined' && process.env.NODE_ENV !== 'test') {
            // eslint-disable-next-line no-console
            console.log(`Using v${VERSION} version`);
        }

        let exitCode = 0;
        try {
            const args = parse(NAME, process.argv);
            const program = new Program();
            await program.init(args);
            await program.parse(process.argv);
        } catch (error: unknown) {
            exitCode = 1;

            if (own<HookMeta, 'hook'>(error, 'hook')) {
                const {service, hook, name} = error.hook;
                // eslint-disable-next-line no-console
                console.error(
                    `Intercept error for ${service}.${hook} hook from ${name} extension.`,
                );
            }

            const message = errorMessage(error);
            if (message) {
                // eslint-disable-next-line no-console
                console.error(message);
            }
        }

        if (process.env.NODE_ENV !== 'test') {
            // eslint-disable-next-line no-console
            console.timeEnd(MAIN_TIMER_ID);
        }

        process.exit(exitCode);
    })();
}
