import {extract} from '../xliff/extract';
import {compose} from '../xliff/compose';
import {handler} from './handler';

import {Argv} from 'yargs';

import {argvValidator} from '../../validator';

const command = 'translate';

const description = 'translate documentation with Yandex.Cloud Translator API';

const translate = {
    command,
    description,
    handler,
    builder,
};

function builder<T>(argv: Argv<T>) {
    return argv
        .command(extract)
        .command(compose)
        .option('folder-id', {
            describe: 'folder id',
            type: 'string',
        })
        .option('source-language', {
            alias: 'sl',
            describe: 'source language code',
            type: 'string',
        })
        .option('target-language', {
            alias: 'tl',
            describe: 'target language code',
            type: 'string',
        })
        .option('include', {
            describe: 'relative to input globs to include in processing',
            type: 'string',
        })
        .option('exclude', {
            describe: 'relative to input globs to exclude from processing',
            type: 'string',
        })
        .check(argvValidator);
}

export {translate};

export default {translate};
