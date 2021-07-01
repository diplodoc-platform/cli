import {blue, green, grey} from 'chalk';
import {ArgvService} from '../services';

function writeLog(msg: string) {
    const {quiet} = ArgvService.getConfig();

    if (quiet) {
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
};
