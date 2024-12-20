import type {HookMeta} from './utils';

import {MAIN_TIMER_ID} from '~/constants';

export type {ICallable, IProgram, ProgramConfig, ProgramArgs} from './program';
export {Program} from './program';

export type {Config, OptionInfo} from './config';
export {Command, option} from './config';

import {Program} from './program';
import {own} from './utils';

if (require.main === module) {
    (async () => {
        // eslint-disable-next-line no-console
        console.time(MAIN_TIMER_ID);

        let exitCode = 0;
        try {
            const program = new Program();
            await program.init(process.argv);
            await program.parse(process.argv);
        } catch (error: any) {
            exitCode = 1;

            if (own<HookMeta>(error, 'hook')) {
                const {service, hook, name} = error.hook;
                // eslint-disable-next-line no-console
                console.error(
                    `Intercept error for ${service}.${hook} hook from ${name} extension.`,
                );
            }

            const message = error?.message || error;
            if (message) {
                // eslint-disable-next-line no-console
                console.error(error.message || error);
            }
        }

        if (process.env.NODE_ENV !== 'test') {
            // eslint-disable-next-line no-console
            console.timeEnd(MAIN_TIMER_ID);
        }

        process.exit(exitCode);
    })();
}
