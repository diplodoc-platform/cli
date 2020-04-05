import {YfmArgv} from '../models';

let _argv!: YfmArgv;

function getConfig() {
    return _argv;
}

function init(argv: YfmArgv) {
    _argv = argv;
}

export default {
    getConfig,
    init,
};
