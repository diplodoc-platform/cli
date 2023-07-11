import {YfmArgv} from '../models';
import {join} from 'path';
import {readFileSync} from 'fs';

let _argv!: YfmArgv;

function getConfig() {
    return _argv;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function init(argv: any) {
    _argv = {
        ...argv,
        ignore: Array.isArray(argv.ignore) ? argv.ignore : [],
        vars: JSON.parse(argv.vars),
    } as YfmArgv;

    try {
        const ignorefile = readFileSync(join(_argv.rootInput, '.yfmignore'), 'utf8');
        const ignore = ignorefile.split('\n');

        _argv.ignore = _argv.ignore.concat(ignore);
    } catch {}

    _argv.ignore = _argv.ignore.concat([
        'node_modules/**',
        '*/node_modules/**',
    ]);
}

function set(argv: YfmArgv) {
    _argv = argv;
}

export default {
    getConfig,
    init,
    set,
};
