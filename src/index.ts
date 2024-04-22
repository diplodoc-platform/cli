import {MAIN_TIMER_ID} from '~/constants';

export type {ICallable, IProgram, ProgramConfig, ProgramArgs} from './program';
export {Program} from './program';

export type {Config, OptionInfo} from './config';
export {Command, option, deprecated} from './config';

import {Program} from './program';

if (require.main === module) {
    (async () => {
        console.time(MAIN_TIMER_ID);

        let exitCode = 0;
        try {
            const program = new Program();
            await program.init(process.argv);
            await program.parse(process.argv);
        } catch (error: any) {
            exitCode = 1;

            const message = error?.message || error;

            if (message) {
                console.error(error.stack || error.message || error);
            }
        }

        console.timeEnd(MAIN_TIMER_ID);

        process.exit(exitCode);
    })();
}
