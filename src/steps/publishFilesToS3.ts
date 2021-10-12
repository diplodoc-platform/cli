import {readFileSync} from 'fs';
import walkSync from 'walk-sync';
import {resolve, join} from 'path';
import S3 from 'aws-sdk/clients/s3';
import mime from 'mime';

import {ArgvService} from '../services';
import {convertBackSlashToSlash, logger} from '../utils';

const DEFAULT_PREFIX = process.env.YFM_STORAGE_PREFIX ?? '';

export function publishFilesToS3(): void {
    const {
        output: outputFolderPath,
        ignore = [],
        storageEndpoint: endpoint,
        storageBucket: bucket,
        storagePrefix: prefix = DEFAULT_PREFIX,
        storageKeyId: accessKeyId,
        storageSecretKey: secretAccessKey,
    } = ArgvService.getConfig();

    const s3Client = new S3({
        endpoint, accessKeyId, secretAccessKey,
    });

    const filesToPublish: string[] = walkSync(resolve(outputFolderPath), {
        directories: false,
        includeBasePath: false,
        ignore,
    });

    for (const pathToFile of filesToPublish) {
        mime.define({
            'text/plain': ['yfm'],
        }, true);

        const mimeType = mime.getType(pathToFile);
        const params: S3.Types.PutObjectRequest = {
            ContentType: mimeType ? mimeType : undefined,
            Bucket: bucket,
            Key: convertBackSlashToSlash(join(prefix, pathToFile)),
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
