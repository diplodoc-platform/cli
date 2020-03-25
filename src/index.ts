import yargs from 'yargs';
import {writeFileSync} from 'fs';
import {resolve} from 'path';

import {generateStaticMarkup} from './app';

yargs
    .command('generate [value] [output]', 'generate static html based on passed value', (yargs) => {
        yargs
            .positional('value', {
                describe: 'some value to pass in HTML',
                default: null
            })
            .positional('output', {
                describe: 'output path for generate html file',
                default: './'
            })
    }, (argv) => {
        if (argv.verbose) {
            console.info(`start server on :${argv.port}`);
        }

        const html = generateStaticMarkup(String(argv.value));
        const path = argv.output ? String(argv.output) : './';
        const pathToFile = resolve(path, 'index.html');

        writeFileSync(pathToFile, html);
    })
    .option('verbose', {
        alias: 'v',
        type: 'boolean',
        description: 'Run with verbose logging'
    })
    .argv;
