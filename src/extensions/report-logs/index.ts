import type {BaseProgram} from '@diplodoc/cli/lib/program';
import {getHooks as getLoggerHooks} from '@diplodoc/cli/lib/logger';

export class Extension {
    apply(program: BaseProgram) {
        program.report.warns = [];
        program.report.errors = [];

        getLoggerHooks(program.logger).Warn.tap('BuildReport', (message) => {
            program.report.warns.push(message);

            return message;
        });

        getLoggerHooks(program.logger).Error.tap('BuildReport', (message) => {
            program.report.errors.push(message);

            return message;
        });
    }
}
