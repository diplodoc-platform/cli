import {resolve, join, dirname} from 'path';
const {promises: {readFile, writeFile, mkdir}} = require('fs');

const yfm2xliff = require('@doc-tools/yfm2xliff/lib/cjs');

import {ArgvService} from '../../services';
import {glob, logger} from '../../utils';
import {MD_EXT_NAME, SKL_EXT_NAME, XLF_EXT_NAME} from './constants';

import {Arguments} from 'yargs';

const command = 'extract';

const description = 'extract xliff and skeleton from yfm documentation';

const extract = {command, description, handler};

const MD_GLOB = '**/*.md';

const MDExtPattern = `\\.${MD_EXT_NAME}$`;
const MDExtFlags = 'mui';
const MDExtRegExp = new RegExp(MDExtPattern, MDExtFlags);

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function handler(args: Arguments<any>) {
    ArgvService.init({
        ...args,
    });

    const {input, output} = args;

    logger.info(input, `yfm xliff extract: extracting skeleton and xliff files from: ${input} to: ${output}`);

    try {
        let cache = {};
        let found = [];

        ({state: {found, cache}} = await glob(join(input, MD_GLOB), {
            nosort: true,
            cache,
        }));

        const data = await Promise.all(found.map(async (path: string) => {
            const outputPath = path.replace(input, output);

            return {
                md: await readFile(resolve(path), {encoding: 'utf-8'}),
                mdPath: resolve(path),
                sklPath: resolve(outputPath.replace(MDExtRegExp, `.${SKL_EXT_NAME}.${MD_EXT_NAME}`)),
                xlfPath: resolve(outputPath.replace(MDExtRegExp, `.${XLF_EXT_NAME}`)),
            };
        }));

        if (!data?.length) {
            throw new Error('failed reading skeleton and xliff files');
        }

        logger.info(input, `yfm xliff extract: finished reading markdown from: ${input}`);

        const xlfs = await Promise.all(data.map(async (datum) =>
            ({extracted: await yfm2xliff.extract(datum), xlfPath: datum.xlfPath})));

        await Promise.all(
            xlfs.map(async ({
                extracted: {skeleton, data: {skeletonFilename}, xliff},
                xlfPath,
            }) => {
                await mkdir(dirname(xlfPath), {recursive: true});

                await Promise.all([
                    writeFile(skeletonFilename, skeleton),
                    writeFile(xlfPath, xliff),
                ]);
            }),
        );

        logger.info(input, `yfm xliff extract: finished extracting skeleton and xliff files to: ${output}`);
    } catch (err) {
        logger.error(input, `yfm xliff extract: ${err}`);

        process.exit(1);
    }
}

export {extract};

export default {extract};
