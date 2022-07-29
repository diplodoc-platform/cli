import {blue, green, grey, red} from 'chalk';
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
    error: function (pathToFile = '', extraMessage = '') {
        let message = `${red('ERROR')} Fatal Failure`;
        if (pathToFile.length) { message += ` File: ${pathToFile}`; }
        if (extraMessage.length) { message += `\n${extraMessage}`; }

        writeLog(message, true);
    },
};
