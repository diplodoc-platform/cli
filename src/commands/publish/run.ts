import type {PublishConfig} from './index';

import {join, resolve} from 'path';
import {createReadStream} from 'fs';
import {Upload} from '@aws-sdk/lib-storage';
import {S3Client} from '@aws-sdk/client-s3';

import {Logger} from '~/core/logger';
import {normalizePath} from '~/core/utils';

/**
 * This is transferable context for publish command.
 * Use this context to communicate with lower data processing levels.
 */
export class Run {
    readonly root: string;

    readonly s3: S3Client;

    readonly logger: Logger;

    readonly config: Omit<PublishConfig, 'strict'>;

    constructor(config: Omit<PublishConfig, 'strict'>) {
        this.config = config;
        this.root = resolve(config.input);

        const {endpoint, region, accessKeyId, secretAccessKey} = config;

        this.s3 = new S3Client({
            endpoint,
            region,
            credentials: {accessKeyId, secretAccessKey},
        });

        this.logger = new Logger(config, [
            (_level, message) => message.replace(new RegExp(this.root, 'ig'), ''),
        ]);
    }

    async send(file: string, type?: string | boolean) {
        const {prefix, bucket} = this.config;

        const upload = new Upload({
            client: this.s3,
            params: {
                ContentType: typeof type === 'string' ? type : undefined,
                Bucket: bucket,
                Key: normalizePath(join(prefix, file)),
                Body: createReadStream(resolve(this.root, file)),
            },
        });

        await upload.done();
    }
}
