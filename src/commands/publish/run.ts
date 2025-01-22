import type {PublishConfig} from './index';
import {Logger} from '~/core/logger';
import {PutObjectCommand, S3Client} from '@aws-sdk/client-s3';
import {normalizePath} from '~/utils';
import {join, resolve} from 'path';
import {createReadStream} from 'fs';

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

        await this.s3.send(
            new PutObjectCommand({
                ContentType: typeof type === 'string' ? type : undefined,
                Bucket: bucket,
                Key: normalizePath(join(prefix, file)),
                Body: createReadStream(resolve(this.root, file)),
            }),
        );
    }
}
