import {YfmArgv} from '../models';

let _argv!: YfmArgv;

function getConfig() {
    return _argv;
}

function init(argv: any) {
    _argv = {
        ...argv,
        vars: JSON.parse(argv.vars)
    } as YfmArgv;
}

export default {
    getConfig,
    init,
};
