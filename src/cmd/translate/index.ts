import {extract} from './extract';
import {compose} from './compose';
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
    return (
        argv
            // @ts-ignore
            .command(extract)
            // @ts-ignore
            .command(compose)
            .option('input', {
                alias: 'i',
                describe: 'input folder with markdown files',
                type: 'string',
                default: process.cwd(),
            })
            .option('output', {
                alias: 'o',
                describe: 'output folder to store xliff and skeleton files',
                type: 'string',
            })
            .option('auth', {
                describe: 'auth credentials path',
                type: 'string',
            })
            .option('folder', {
                describe: 'folder',
                type: 'string',
            })
            .option('source', {
                alias: ['sl', 'sll', 'source-language', 'source-language-locale'],
                describe: 'source language and locale',
                type: 'string',
            })
            .option('target', {
                alias: ['tl', 'tll', 'target-language', 'target-language-locale'],
                describe: 'target language and locale',
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
            .option('dry-run', {
                describe: 'check command usage',
                type: 'boolean',
            })
            .check(argvValidator)
    );
}

export {translate};

export default {translate};
