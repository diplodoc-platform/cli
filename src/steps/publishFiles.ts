import {readFileSync} from 'fs';
import walkSync from 'walk-sync';
import {resolve, join} from 'path';
import S3 from 'aws-sdk/clients/s3';
import mime from 'mime-types';

import {ArgvService} from '../services';
import {logger} from '../utils';

/**
 * Publishes output files to S3 compatible storage
 * @return {void}
 */
export function publishFiles() {
    const {
        output: outputFolderPath,
        ignore = [],
        storageEndpoint,
        storageBucket,
        storagePrefix,
        storageKeyId,
        storageSecretKey,
    } = ArgvService.getConfig();

    const endpoint = storageEndpoint ?? process.env.STORAGE_ENDPOINT;
    const bucket = storageBucket ?? process.env.STORAGE_BUCKET;
    const prefix = storagePrefix ?? process.env.STORAGE_PREFIX ?? '';
    const accessKeyId = storageKeyId ?? process.env.STORAGE_KEY_ID;
    const secretAccessKey = storageSecretKey ?? process.env.STORAGE_SECRET_KEY;

    if (!endpoint) {
        throw new Error('Endpoint of S3 storage must be provided');
    }

    if (!bucket) {
        throw new Error('Bucket name of S3 storage must be provided');
    }

    if (!accessKeyId) {
        throw new Error('Key Id of S3 storage must be provided');
    }

    if (!secretAccessKey) {
        throw new Error('Secret key of S3 storage must be provided');
    }

    const s3Client = new S3({
        endpoint, accessKeyId, secretAccessKey,
    });

    const filesToPublish: string[] = walkSync(resolve(outputFolderPath), {
        directories: false,
        includeBasePath: false,
        ignore,
    });

    for (const pathToFile of filesToPublish) {
        const mimeType = mime.lookup(pathToFile);

        const params: S3.Types.PutObjectRequest = {
            ContentType: mimeType ? mimeType : undefined,
            Bucket: bucket,
            Key: join(prefix, pathToFile),
            Body: readFileSync(resolve(outputFolderPath, pathToFile)),
        };

        logger.upload(pathToFile);

        s3Client.upload(params, (error) => {
            if (error) {
                throw error;
            }
        });
    }
}
