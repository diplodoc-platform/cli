import {resolve, dirname} from 'path';
const {promises: {readFile, writeFile, mkdir}} = require('fs');

const yfm2xliff = require('@doc-tools/yfm2xliff/lib/cjs');

import {deepFiles} from '../../utils';
import {
    allPass, complement, isHidden, isMdExtension,
} from '../../services/includers/batteries/common';

import {Arguments} from 'yargs';

const command = 'extract';

const description = 'extract xliff and skeleton from yfm documentation';

const extract = {command, description, handler};

const filterMD = allPass([isMdExtension, complement(isHidden)]);

const deepMDFiles = deepFiles(filterMD);

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function handler(args: Arguments<any>) {
    const {input, output} = args;
    const paths = await deepMDFiles(input);

    const data = await Promise.all(paths.map(async (path: string) => {
        const outputPath = path.replace(input, output);

        return {
            md: await readFile(resolve(path), {encoding: 'utf-8'}),
            mdPath: resolve(path),
            sklPath: resolve(outputPath.replace(/.md$/gmu, '.skl.md')),
            xlfPath: resolve(outputPath.replace(/.md$/gmu, '.xlf')),
        };
    }));

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
}

export {extract};

export default {extract};
