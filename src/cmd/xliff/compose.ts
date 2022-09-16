import {Arguments} from 'yargs';
const {promises: {readFile, writeFile, mkdir}} = require('fs');
import {join, resolve, dirname} from 'path';

const yfm2xliff = require('@doc-tools/yfm2xliff/lib/cjs');

import {ArgvService} from '../../services';
import {glob, logger} from '../../utils';
import {MD_EXT_NAME, SKL_EXT_NAME, XLF_EXT_NAME} from './constants';

const command = 'compose';

const description = 'compose xliff and skeleton into documentation';

const compose = {command, description, handler};

const XLFExtPattern = `\\.${XLF_EXT_NAME}$`;
const XLFExtFlags = 'mui';
const XLFExtRegExp = new RegExp(XLFExtPattern, XLFExtFlags);

const SKL_MD_GLOB = `**/*.${SKL_EXT_NAME}.${MD_EXT_NAME}`;
const XLF_GLOB = `**/*.${XLF_EXT_NAME}`;

const composer = async (xliff: string, skeleton: string) => new Promise((res, rej) =>
    yfm2xliff.compose(xliff, skeleton, (err: Error, composed: string) => {
        if (err) {
            rej(err);
        }

        return res(composed);
    }));

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function handler(args: Arguments<any>) {
    ArgvService.init({
        ...args,
    });

    const {input, output} = args;

    logger.info(input, `yfm xliff compose: composing skeleton and xliff files from: ${input} into documentation at: ${output}`);

    try {
        let cache = {};
        let found = [];

        ({state: {found, cache}} = await glob(join(input, SKL_MD_GLOB), {
            nosort: true,
            cache,
        }));

        const sklPaths = found;

        ({state: {found, cache}} = await glob(join(input, XLF_GLOB), {
            nosort: true,
            cache,
        }));

        const xlfPaths = found;

        if (!xlfPaths?.length || xlfPaths?.length !== sklPaths?.length) {
            throw new Error('failed reading skeleton and xliff files');
        }

        const [skls, xlfs, paths] = await Promise.all([
            Promise.all(sklPaths.map(async (path: string) =>
                readFile(resolve(path), {encoding: 'utf-8'}))),
            Promise.all(xlfPaths.map(async (path: string) =>
                readFile(resolve(path), {encoding: 'utf-8'}))),
            Promise.all(xlfPaths.map(async (path: string) =>
                path.replace(XLFExtRegExp, '').replace(input, output)))]);

        logger.info(input, `yfm xliff compose: finished reading skeleton and xliff files from: ${input}`);

        await Promise.all(paths.map(async (path, i) => {
            await mkdir(dirname(path), {recursive: true});

            return writeFile(`${path}.md`, await composer(xlfs[i], skls[i]));
        }));

        logger.info(input, `yfm xliff compose: finished composing into documentation at: ${output}`);
    } catch (err) {
        logger.error(input, `yfm xliff compose: ${err}`);

        process.exit(1);
    }
}

export {compose};

export default {compose};
