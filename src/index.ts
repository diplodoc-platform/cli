import {Program} from './program';

export type {ICallable, IProgram, ProgramConfig, ProgramArgs} from './program';
export {Program} from './program';

export type {Config, OptionInfo} from './config';
export {Command, option, deprecated} from './config';

const program = new Program(process.argv);

program.apply();
