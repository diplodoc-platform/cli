import * as yargs from 'yargs';
import {writeFileSync} from 'fs';
import {resolve} from 'path';

import {generateStaticMarkup} from './app';

const argv = yargs
    .option('value', {
        alias: 'v',
        describe: 'Value that will be passed',
    })
    .option('output', {
        alias: 'o',
        describe: 'Path to output folder'
    })
    .example(`yfm-docs --value=test --output=./output-dir`, '')
    .demandOption(['value', 'output'], 'Please provide value and output arguments to work with this tool')
    .help()
    .argv;

const html = generateStaticMarkup(String(argv.value));
const path = argv.output ? String(argv.output) : './';
const pathToFile = resolve(path, 'index.html');

writeFileSync(pathToFile, html);
