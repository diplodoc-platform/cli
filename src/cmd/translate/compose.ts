import {mkdir} from 'node:fs/promises';
import {dirname, extname, join} from 'path';
import {Arguments, Argv} from 'yargs';
import {eachLimit} from 'async';
import {ComposeOptions, compose as _compose} from '@diplodoc/translation';

import {ArgvService} from '../../services';
import {argvValidator} from '../../validator';
import {TranslateParams, dumpFile, loadFile, normalizeParams, resolveSchemas} from './utils';

const command = 'compose';

const description = 'compose xliff and skeleton into documentation';

const compose = {command, description, handler, builder};

const MAX_CONCURRENCY = 50;

function builder<T>(argv: Argv<T>) {
    return argv
        .option('input', {
            alias: 'i',
            describe: 'input folder with xliff and skeleton files',
            type: 'string',
            default: process.cwd(),
        })
        .option('output', {
            alias: 'o',
            describe: 'output folder where translated markdown will be stored',
            type: 'string',
        })
        .option('use-source', {
            describe: 'for debug',
            type: 'boolean',
        })
        .check(argvValidator);
}

type InputParams = {
    input: string;
    output: string;
};

type HandlerParams = {
    exclude?: string[];
    useSource?: boolean;
    translate?: HandlerParams & {
        compose?: HandlerParams;
    };
};

type FileInfo = {
    path: string;
    xliff: string;
    skl: string;
    ext: string;
};

async function handler(args: Arguments<InputParams & HandlerParams>) {
    const params = normalizeParams(
        {
            ...(args.translate || {}),
            ...(args.translate?.compose || {}),
            ...args,
        },
        ['.skl', '.xliff'],
    );

    ArgvService.init(params);

    const {
        input,
        output,
        files,
        useSource = false,
    } = ArgvService.getConfig() as unknown as TranslateParams;

    const pairs = files.reduce(
        (acc, file) => {
            const ext = extname(file);
            const path = file.slice(0, -ext.length);

            acc[path] = acc[path] || {path, ext};
            acc[path][ext.slice(1) as 'xliff' | 'skl'] = file;

            return acc;
        },
        {} as Record<string, FileInfo>,
    );

    const configuredPipeline = pipeline(input, output, {useSource});

    await eachLimit(pairs, MAX_CONCURRENCY, configuredPipeline);
}

function pipeline(input: string, output: string, {useSource}: ComposeOptions) {
    return async (file: FileInfo) => {
        const [skeleton, xliff] = await Promise.all([
            loadFile(join(input, file.skl)),
            loadFile<string>(join(input, file.xliff)),
        ]);

        const schemas = await resolveSchemas(file.path);
        if (['.yaml', '.json'].includes(file.ext) && !schemas.length) {
            return;
        }

        const result = _compose(skeleton, xliff, {useSource, schemas});
        const filePath = join(output, file.path);

        await mkdir(dirname(filePath), {recursive: true});
        await dumpFile(filePath, result);
    };
}

export {compose};

export default {compose};
