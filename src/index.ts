import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import log from '@doc-tools/transform/lib/log';
import 'threads/register';

import {MAIN_TIMER_ID} from './constants';

import {build, xliff, translate, publish} from './cmd';

console.time(MAIN_TIMER_ID);

yargs
    .command(build)
    .command(publish)
    .command(xliff)
    .command(translate)
    .option('config', {
        alias: 'c',
        describe: 'YFM configuration file',
        type: 'string',
    })
    .option('strict', {
        alias: 's',
        default: false,
        describe: 'Run in strict mode',
        type: 'boolean',
    })
    .option('quiet', {
        alias: 'q',
        default: false,
        describe: 'Run in quiet mode. Don\'t write logs to stdout',
        type: 'boolean',
    })
    .group(['config', 'strict', 'quiet', 'help', 'version'], 'Common options:')
    .version(typeof VERSION !== 'undefined' ? VERSION : '')
    .help()
    .parse(hideBin(process.argv), {}, (err, {strict}, output) => {
        console.timeEnd(MAIN_TIMER_ID);

        if (err) {
            console.error(err);
            process.exit(1);
        }

        const {warn, error} = log.get();

        if (strict && warn.length || error.length) {
            process.exit(1);
        }

        console.log(output);

        process.exit(0);
    });
