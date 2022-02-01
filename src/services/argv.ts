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
        vars: JSON.parse(argv.vars),
    } as YfmArgv;
}

function set(argv: YfmArgv) {
    _argv = argv;
}

export default {
    getConfig,
    init,
    set,
};
