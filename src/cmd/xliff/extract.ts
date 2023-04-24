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

class ExtractError extends Error {
    path: string;

    constructor(message: string, path: string) {
        super(message);

        this.path = path;
    }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function handler(args: Arguments<any>) {
    ArgvService.init({
        ...args,
    });

    const {input, output} = args;

    logger.info(input, `extracting skeleton and xliff files from: ${input} to: ${output}`);

    try {
        let cache = {};
        let found = [];

        ({state: {found, cache}} = await glob(join(input, MD_GLOB), {
            nosort: true,
            cache,
        }));

        const data = await Promise.all(found.map(readFn(input, output)));

        if (!data?.length) {
            throw new ExtractError('failed reading skeleton and xliff files', input);
        }

        logger.info(input, `finished reading markdown from: ${input}`);

        const xlfs = await Promise.all(data.map(extractFn));

        await Promise.all(xlfs.map(writeFn));

        logger.info(input, `finished extracting skeleton and xliff files to: ${output}`);
    } catch (err) {
        if (err instanceof Error || err instanceof ExtractError) {
            const message = err.message;

            const file = err instanceof ExtractError ? err.path : '';

            logger.error(file, message);
        }
    }
}

export type ReadFnOutput = {
    md: string;
    mdPath: string;
    sklPath: string;
    xlfPath: string;
};

function readFn(input: string, output: string) {
    return async (path: string): Promise<ReadFnOutput> => {
        let read;

        logger.info(path, 'reading markdown');

        try {
            const outputPath = path.replace(input, output);

            read = ({
                md: await readFile(resolve(path), {encoding: 'utf-8'}),
                mdPath: resolve(path),
                sklPath: resolve(outputPath.replace(MDExtRegExp, `.${SKL_EXT_NAME}.${MD_EXT_NAME}`)),
                xlfPath: resolve(outputPath.replace(MDExtRegExp, `.${XLF_EXT_NAME}`)),
            });
        } catch (err: any) {
            throw new ExtractError(err.message, path);
        }

        return read;
    };
}

export type ExtractFnOutput = {
    extracted: {
        skeleton: string;
        xliff: string;
        data: {
            skeletonFilename: string;
        };
    };
    xlfPath: string;
};

async function extractFn(datum: ReadFnOutput): Promise<ExtractFnOutput> {
    let extracted;

    logger.info(datum.mdPath, 'extracting xliff and skeleton');

    try {
        extracted = {extracted: await yfm2xliff.extract(datum), xlfPath: datum.xlfPath};
    } catch (err: any) {
        throw new ExtractError(err.message, datum.mdPath);
    }

    return extracted;
}

async function writeFn({
    extracted: {skeleton, data: {skeletonFilename}, xliff},
    xlfPath,
}: ExtractFnOutput): Promise<void> {
    const path = skeletonFilename + ' | ' + xlfPath;

    logger.info(path, 'writing skeleton and xliff');

    try {
        await mkdir(dirname(xlfPath), {recursive: true});

        await Promise.all([
            writeFile(skeletonFilename, skeleton),
            writeFile(xlfPath, xliff),
        ]);
    } catch (err: any) {
        throw new ExtractError(err.message, path);
    }
}

export {extract};

export default {extract};
