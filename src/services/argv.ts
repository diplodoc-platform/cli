import {YfmDocArgv} from '../models';

let _argv!: YfmDocArgv;

function getConfig() {
    return _argv;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function init(argv: any) {
    _argv = {
        ...argv,
        ignore: Array.isArray(argv.ignore) ? argv.ignore : [],
        vars: JSON.parse(argv.vars),
    } as YfmDocArgv;
}

export default {
    getConfig,
    init,
};
