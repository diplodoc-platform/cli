import {LogLevels} from '@diplodoc/transform/lib/log';

type Logger = ReturnType<typeof createLogger>;

const formatter: Record<string, (v: string) => string> = {
    [LogLevels.INFO]: (msg) => `INFO ${msg}`,
    [LogLevels.WARN]: (msg) => `WARN ${msg}`,
    [LogLevels.ERROR]: (msg) => `ERR ${msg}`,
};

function createLogger(type: LogLevels) {
    const format = formatter[type];
    return function log(msg: string) {
        console.log(format(msg));
    };
}

export class LogCollector {
    static LogLevels = LogLevels;

    [LogLevels.INFO]: Logger;
    [LogLevels.WARN]: Logger;
    [LogLevels.ERROR]: Logger;

    constructor(quiet = false) {
        this[LogLevels.INFO] = quiet ? () => {} : createLogger(LogLevels.INFO);
        this[LogLevels.WARN] = createLogger(LogLevels.WARN);
        this[LogLevels.ERROR] = createLogger(LogLevels.ERROR);
    }
}
