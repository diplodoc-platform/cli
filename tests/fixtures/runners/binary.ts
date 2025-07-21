import {Runner} from './types';
import {execa} from 'execa';
import strip from 'strip-ansi';

export class BinaryRunner implements Runner {
    private readonly binaryPath: string;

    constructor(binaryPath: string) {
        this.binaryPath = binaryPath;
    }

    async runYfmDocs(argv: string[]) {
        const {stderr, exitCode} = await execa(this.binaryPath, argv, {all: true, reject: false});
        const report = {
            code: exitCode || 0,
            warns: fillLog(/^WARN/, stderr),
            errors: fillLog(/^ERR/, stderr),
        };

        const restLog = fillLog(/^(?!INFO|WARN|ERR)/, stderr);
        if (restLog.length) {
            for (const line of restLog) {
                console.log(line);
            }
        }

        return report;
    }
}

function fillLog(filter: RegExp, source: string) {
    return source.split('\n')
        .map((line) => strip(line).trim())
        .filter(Boolean)
        .filter((line) => line.match(filter));
}
