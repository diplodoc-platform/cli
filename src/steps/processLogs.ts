import log from '@diplodoc/transform/lib/log';
import _uniq from 'lodash/uniq';

export function processLogs(inputFolder: string) {
    const replacementRegExp = new RegExp(inputFolder, 'ig');
    const {info, warn, error} = log.get();
    const outputLogs = _uniq([
        '', ...info,
        '', ...warn,
        '', ...error,
        '',
    ]);

    for (const outputLog of outputLogs) {
        const preparedLog = outputLog.replace(replacementRegExp, '');
        console.log(preparedLog);
    }
}
