import {join} from 'path';
import {readFileSync} from 'fs';

import {YfmArgv} from '../models';

let _argv!: YfmArgv;

function getConfig() {
    return _argv;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function init(argv: any) {
    _argv = {
        ...argv,
        ignore: Array.isArray(argv.ignore) ? argv.ignore : [],
    } as YfmArgv;

    if (argv.vars) {
        _argv.vars = JSON.parse(argv.vars);
    }

    try {
        const ignorefile = readFileSync(join(_argv.rootInput, '.yfmignore'), 'utf8');
        const ignore = ignorefile.split('\n');

        _argv.ignore = _argv.ignore.concat(ignore);
    } catch {}
}

function set(argv: YfmArgv) {
    _argv = argv;
}

export default {
    getConfig,
    init,
    set,
};
