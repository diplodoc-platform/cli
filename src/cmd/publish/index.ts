import {join} from 'path';
import {ArgvService} from '../../services';
import {logger} from '../../utils';

import {Argv, Arguments} from 'yargs';

import {upload} from './upload';

const command = 'publish';

const description = 'Upload builded documentation to target S3 bucket';

const publish = {
    command,
    description,
    handler,
    builder,
};

function builder<T>(argv: Argv<T>) {
    return argv
        .option('strict', {
            default: true,
        })
        .option('input', {
            alias: 'i',
            describe: 'Path to folder with builded files',
            type: 'string',
            required: true,
            group: 'Upload options',
        })
        .option('endpoint', {
            describe: 'S3 bucket endpoint',
            default: 'https://s3.amazonaws.com',
            type: 'string',
            group: 'Upload options',
        })
        .option('region', {
            describe: 'S3 bucket region',
            default: 'eu-central-1',
            type: 'string',
            group: 'Upload options',
        })
        .option('bucket', {
            describe: 'S3 bucket name',
            type: 'string',
            required: true,
            group: 'Upload options',
        })
        .option('prefix', {
            describe: 'S3 bucket ',
            default: '',
            type: 'string',
            group: 'Upload options',
        })
        .option('access-key-id', {
            describe: 'S3 bucket AccessKeyId',
            type: 'string',
            required: true,
            group: 'Upload options',
        })
        .option('secret-access-key', {
            describe: 'S3 bucket SecretAccessKey',
            type: 'string',
            required: true,
            group: 'Upload options',
        });
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function handler(args: Arguments<any>) {
    ArgvService.init({
        ...args,
    });

    const {
        input,
        endpoint,
        bucket,
        prefix,
    } = ArgvService.getConfig();

    logger.info('', `Upload artifacts from ${input} to ${join(endpoint, bucket, prefix)}`);

    try {
        await upload(ArgvService.getConfig());
    } catch (error) {
        logger.error('', error.message);
    }
}

export {publish};
