import {YfmArgv} from '../models';

let _argv!: YfmArgv;

function getConfig() {
    return _argv;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function init(argv: any) {
    _argv = {
        ...argv,
        vars: JSON.parse(argv.vars),
    } as YfmArgv;
}

export default {
    getConfig,
    init,
};
