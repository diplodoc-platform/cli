import log from 'yfm-transform/lib/log';

import {ArgvService} from '../services';
import {MAIN_TIMER_ID} from '../constants';

export function processLogs(inputFolder: string) {
    const replacementRegExp = new RegExp(inputFolder, 'ig');
    const {strict} = ArgvService.getConfig();
    const {info, warn, error} = log.get();
    const outputLogs = [
        '', ...info,
        '', ...warn,
        '', ...error,
        '',
    ];

    for (const outputLog of outputLogs) {
        const preparedLog = outputLog.replace(replacementRegExp, '');
        console.log(preparedLog);
    }

    console.timeEnd(MAIN_TIMER_ID);

    if (strict && warn.length || error.length) {
        process.exit(1);
    }
}
