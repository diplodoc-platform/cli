import {resolve} from 'node:path';
import {execa} from 'execa';
import strip from 'strip-ansi';

export type Report = {
    code: number;
    warns: string[];
    errors: string[];
};

const bin = resolve(__dirname, '../../build/index.js');

export class Runner {
    async runYfmDocs(argv: string[]) {
        const {stderr, exitCode} = await execa(bin, argv, {all: true, reject: false});
        const report = {
            code: exitCode || 0,
            warns: fillLog(/^WARN/, stderr),
            errors: fillLog(/^ERR/, stderr),
        };

        const restLog = fillLog(/^(?!INFO|WARN|ERR)/, stderr);
        if (restLog.length) {
            for (const line of restLog) {
                // eslint-disable-next-line no-console
                console.log(line);
            }
        }

        return report;
    }
}

function fillLog(filter: RegExp, source: string) {
    return source
        .split('\n')
        .map((line) => strip(line).trim())
        .filter(Boolean)
        .filter((line) => line.match(filter));
}

export default new Runner();
