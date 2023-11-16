import type {Argv, Arguments, Options} from 'yargs';
import type {Program} from '../..';
import {SyncWaterfallHook} from 'tapable';
import {join} from 'path';
import {ArgvService} from '../../services';
import {logger} from '../../utils';

import {upload} from './upload';
import {Command} from '../../config';

export class Publish {
    hooks = {
        Options: new SyncWaterfallHook<Record<string, Options>>(['options'], 'Build.Options'),
    };

    apply(program: Program) {
        program.hooks.Command.tap('Build', (command: Command) => {
            const options = this.hooks.Options.call({
                strict: {
                    default: true,
                },
                input: {
                    alias: 'i',
                    describe: 'Path to folder with builded files',
                    type: 'string',
                    required: true,
                    group: 'Upload options',
                },
                endpoint: {
                    describe: 'S3 bucket endpoint',
                    default: 'https://s3.amazonaws.com',
                    type: 'string',
                    group: 'Upload options',
                },
                region: {
                    describe: 'S3 bucket region',
                    default: 'eu-central-1',
                    type: 'string',
                    group: 'Upload options',
                },
                bucket: {
                    describe: 'S3 bucket name',
                    type: 'string',
                    required: true,
                    group: 'Upload options',
                },
                prefix: {
                    describe: 'S3 bucket ',
                    default: '',
                    type: 'string',
                    group: 'Upload options',
                },
                'access-key-id': {
                    describe: 'S3 bucket AccessKeyId',
                    type: 'string',
                    required: true,
                    group: 'Upload options',
                },
                'secret-access-key': {
                    describe: 'S3 bucket SecretAccessKey',
                    type: 'string',
                    required: true,
                    group: 'Upload options',
                },
            });

            // return argv.command({
            //     command: ['publish'],
            //     describe: 'Upload builded documentation to target S3 bucket',
            //     handler: async (args: Arguments<any>) => {
            //         ArgvService.init({
            //             ...args,
            //         });
            //
            //         const {input, endpoint, bucket, prefix} = ArgvService.getConfig();
            //
            //         logger.info(
            //             '',
            //             `Upload artifacts from ${input} to ${join(endpoint, bucket, prefix)}`,
            //         );
            //
            //         try {
            //             await upload(ArgvService.getConfig());
            //         } catch (error: any) {
            //             logger.error('', error.message);
            //         }
            //     },
            //     builder: (argv: Argv) => {
            //         return argv.options(options);
            //     },
            // });
        });
}

type Args = {
    input: string;
    endpoint: string;
    region: string;
    bucket: string;
    prefix: string;
    ignore: string[];
    accessKeyId: string;
    secretAccessKey: string;
};

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function handler(args: Arguments<Args>) {
    ArgvService.init({
        ...args,
    });

    const config = ArgvService.getConfig() as unknown as Args;
    const {input, endpoint, bucket, prefix} = config;

    logger.info('', `Upload artifacts from ${input} to ${join(endpoint, bucket, prefix)}`);

    try {
        await upload(config);
    } catch (error: any) {
        logger.error('', error.message);
    }
}
