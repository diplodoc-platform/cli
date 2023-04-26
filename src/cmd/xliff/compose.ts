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

class ComposeError extends Error {
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

    logger.info(input, 'composing skeleton and xliff files');

    try {
        let cache = {};
        let found = [];

        ({state: {found, cache}} = await glob(join(input, SKL_MD_GLOB), {
            nosort: false,
            cache,
        }));

        const sklPaths = found;

        ({state: {found, cache}} = await glob(join(input, XLF_GLOB), {
            nosort: false,
            cache,
        }));

        const xlfPaths = found;

        if (!xlfPaths?.length || xlfPaths?.length !== sklPaths?.length) {
            throw new ComposeError('failed reading skeleton and xliff files', input);
        }

        logger.info(input, 'reading skeleton and xliff files');

        const [skls, xlfs, paths] = await Promise.all([
            Promise.all(sklPaths.map(readFn)),
            Promise.all(xlfPaths.map(readFn)),
            Promise.all(xlfPaths.map(async (path: string) =>
                path.replace(XLFExtRegExp, '').replace(input, output)))]);

        logger.info(input, 'finished reading skeleton and xliff files');

        const composed = await Promise.all(paths.map(composeFn(xlfs, skls)));

        await Promise.all(composed.map(writeFn));

        logger.info(output, 'finished composing into documentation');
    } catch (err) {
        if (err instanceof Error || err instanceof ComposeError) {
            const message = err.message;

            const file = err instanceof ComposeError ? err.path : '';

            logger.error(file, message);
        }
    }
}

async function readFn(path: string) {
    logger.info(path, 'reading file');

    let file;

    try {
        file = readFile(resolve(path), {encoding: 'utf-8'});
    } catch (err: any) {
        throw new ComposeError(err.message, path);
    }

    return file;
}

export type ComposeFnOutput = {
    path: string;
    composed: string;
};

function composeFn(xlfs: string[], skls: string[]) {
    return async (path: string, i: number): Promise<ComposeFnOutput> => {
        logger.info(path, 'composing skeleton and xliff files');

        let composed;

        try {
            composed = await composer(xlfs[i], skls[i]) as string;
        } catch (err: any) {
            throw new ComposeError(err.message, path);
        }

        return {
            composed,
            path,
        };
    };
}

async function writeFn({composed, path}: ComposeFnOutput) {
    const file = `${path}.md`;

    logger.info(file, 'writing composed file');

    try {
        await mkdir(dirname(path), {recursive: true});

        return writeFile(file, composed);
    } catch (err: any) {
        throw new ComposeError(err.message, file);
    }
}

export {compose};

export default {compose};
