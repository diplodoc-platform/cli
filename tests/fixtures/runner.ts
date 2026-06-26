import {resolve} from 'node:path';
import {execa} from 'execa';
import strip from 'strip-ansi';

export type Report = {
    code: number;
    warns: string[];
    errors: string[];
};

export type RawReport = Report & {
    stdout: string;
    stderr: string;
};

const bin = process.env.DIPLODOC_BINARY_PATH || resolve(__dirname, '../../build/index.js');

export class Runner {
    /**
     * Like {@link runYfmDocs} but also returns raw stdout/stderr.
     * Useful for commands that emit their result to stdout (e.g. `content`).
     */
    async runRaw(argv: string[], env?: Record<string, string>): Promise<RawReport> {
        const {stdout, stderr, exitCode} = await execa(bin, argv, {
            reject: false,
            env: {...process.env, ...env},
        });

        return {
            code: exitCode || 0,
            stdout,
            stderr,
            warns: fillLog(/^WARN/, stderr),
            errors: fillLog(/^ERR/, stderr),
        };
    }

    async runYfmDocs(argv: string[], env?: Record<string, string>) {
        const {stderr, exitCode} = await execa(bin, argv, {
            all: true,
            reject: false,
            env: {...process.env, ...env},
        });
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
        } else if (report.code > 0) {
            // eslint-disable-next-line no-console
            console.error(stderr);
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
