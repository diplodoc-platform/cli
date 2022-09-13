import {Arguments} from 'yargs';
const {promises: {readFile, writeFile, mkdir}} = require('fs');
import {resolve, dirname} from 'path';

const yfm2xliff = require('@doc-tools/yfm2xliff/lib/cjs');

import {deepFiles} from '../../utils';
import {
    allPass, complement, isHidden,
} from '../../services/includers/batteries/common';

const command = 'compose';

const description = 'compose xliff and skeleton into documentation';

const compose = {command, description, handler};

const isSKLExtension = (str: string) => /.skl.md$/gmu.test(str);
const filterSKL = allPass([isSKLExtension, complement(isHidden)]);
const deepSKLFiles = deepFiles(filterSKL);

const isXLFExtension = (str: string) => /.xlf$/gmu.test(str);
const filterXLF = allPass([isXLFExtension, complement(isHidden)]);
const deepXLFFiles = deepFiles(filterXLF);

const composer = async (xliff: string, skeleton: string) => new Promise((res, rej) =>
    yfm2xliff.compose(xliff, skeleton, (err: Error, composed: string) => {
        if (err) {
            rej(err);
        }

        return res(composed);
    }));

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function handler(args: Arguments<any>) {
    const {input, output} = args;

    const [sklPaths, xlfPaths] = await Promise.all([
        deepSKLFiles(input),
        deepXLFFiles(input)]);

    const [skls, xlfs, paths] = await Promise.all([
        Promise.all(sklPaths.map(async (path: string) =>
            readFile(resolve(path), {encoding: 'utf-8'}))),
        Promise.all(xlfPaths.map(async (path: string) =>
            readFile(resolve(path), {encoding: 'utf-8'}))),
        Promise.all(xlfPaths.map(async (path: string) =>
            path.replace(/.xlf$/gmu, '').replace(input, output)))]);

    await Promise.all(paths.map(async (path, i) => {
        await mkdir(dirname(path), {recursive: true});

        return writeFile(`${path}.md`, await composer(xlfs[i], skls[i]));
    }));
}

export {compose};

export default {compose};
