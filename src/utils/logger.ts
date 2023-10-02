import log from '@diplodoc/transform/lib/log';
import {blue, green, grey, red, yellow} from 'chalk';
import {ArgvService} from '../services';

function writeLog(msg: string, fatal = false) {
    const {quiet} = ArgvService.getConfig();

    if (quiet && !fatal) {
        return;
    }

    console.log(msg);
}

export const logger = {
    info: function (pathToFile: string, extraMessage?: string) {
        writeLog(`${grey('INFO')} ${extraMessage} ${pathToFile}`);
    },
    proc: function (pathToFile: string) {
        writeLog(`${blue('PROC')} Processing file ${pathToFile}`);
    },
    copy: function (pathToFile: string) {
        writeLog(`${green('COPY')} Copying file ${pathToFile}`);
    },
    upload: function (pathToFile: string) {
        writeLog(`${green('UPLOAD')} Uploading file ${pathToFile}`);
    },
    warn: function (pathToFile: string, extraMessage: string) {
        const message = `${yellow('WARNING')} file: ${pathToFile} error: ${extraMessage}`;

        writeLog(message);

        log.warn(`file: ${pathToFile} ${extraMessage}`);
    },
    error: function (pathToFile: string, extraMessage: string) {
        const message = `${red('ERROR')} file: ${pathToFile} error: ${extraMessage}`;

        writeLog(message, true);

        log.error(`file: ${pathToFile} ${extraMessage}`);
    },
};
