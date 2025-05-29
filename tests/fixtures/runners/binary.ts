import {Runner} from './types';
import {execa} from 'execa';

export class BinaryRunner implements Runner {
    private readonly binaryPath: string;

    constructor(binaryPath: string) {
        this.binaryPath = binaryPath;
    }

    async runYfmDocs(argv: string[]) {
        const {stderr, exitCode} = await execa(this.binaryPath, argv, {all: true});
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
    return source.split('\n').filter((line) => line.match(filter));
}
