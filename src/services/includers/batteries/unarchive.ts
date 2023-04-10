import {mkdirSync, createReadStream, createWriteStream} from 'fs';
import {join, dirname} from 'path';
import {extract, Headers} from 'tar-stream';

import type {PassThrough} from 'stream';

import {IncluderFunctionParams} from '../../../models';

const name = 'unarchive';

class UnarchiveIncluderError extends Error {
    path: string;

    constructor(message: string, path: string) {
        super(message);

        this.name = 'UnarchiveIncluderError';
        this.path = path;
    }
}

function pipeline(readPath: string, writeBasePath: string): Promise<void> {
    return new Promise((res, rej) => {
        const reader = createReadStream(readPath);

        reader.on('error', (err: Error) => {
            rej(err);
        });

        const extractor = extract();

        extractor.on('error', (err: Error) => {
            rej(err);
        });

        mkdirSync(writeBasePath, {recursive: true});

        extractor.on('entry', (header: Headers, stream: PassThrough, next: Function) => {
            const {type, name} = header;

            const writePath = join(writeBasePath, name);

            const writeDirPath = type === 'directory' ? writePath : dirname(writePath);

            mkdirSync(writeDirPath, {recursive: true});

            if (type !== 'directory') {
                const writer = createWriteStream(writePath, {flags: 'w'});

                writer.on('error', (err) => {
                    rej(err);
                });

                stream.pipe(writer);
            }

            stream.on('end', () => {
                next();
            });

            stream.resume();
        });

        reader.pipe(extractor).on('finish', () => {
            res();
        });
    });
}

type Params = {
    input: string;
    output: string;
};

async function includerFunction(params: IncluderFunctionParams<Params>) {
    const {readBasePath, writeBasePath, tocPath, passedParams: {input, output}, index} = params;

    if (!input?.length || !output?.length) {
        throw new UnarchiveIncluderError('provide includer with input parameter', tocPath);
    }

    const contentPath = index === 0
        ? join(writeBasePath, input)
        : join(readBasePath, input);

    const writePath = join(writeBasePath, output);

    try {
        await pipeline(contentPath, writePath);
    } catch (err) {
        throw new UnarchiveIncluderError(err.toString(), tocPath);
    }

    return {input: output};
}

export {name, includerFunction};

export default {name, includerFunction};
