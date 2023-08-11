import {createReadStream} from 'fs';
import walkSync from 'walk-sync';
import {resolve, join} from 'path';
import {S3Client, PutObjectCommand} from '@aws-sdk/client-s3';
import mime from 'mime-types';

import {convertBackSlashToSlash, logger} from '../../utils';
import {asyncify, mapLimit} from 'async';

interface UploadProps {
    input: string;
    ignore: string[];
    endpoint: string;
    bucket: string;
    prefix: string;
    accessKeyId: string;
    secretAccessKey: string;
    region?: string;
}

export async function upload(props: UploadProps): Promise<void> {
    const {
        input,
        ignore = [],
        endpoint,
        region,
        bucket,
        prefix,
        accessKeyId,
        secretAccessKey,
    } = props;

    const s3Client = new S3Client({
        endpoint,
        region,
        credentials: {accessKeyId, secretAccessKey},
    });

    const filesToPublish: string[] = walkSync(resolve(input), {
        directories: false,
        includeBasePath: false,
        ignore,
    });

    await mapLimit(filesToPublish, 100, asyncify(async (pathToFile: string) => {
        const mimeType = mime.lookup(pathToFile);

        logger.upload(pathToFile);

        try {
            await s3Client.send(new PutObjectCommand({
                ContentType: mimeType ? mimeType : undefined,
                Bucket: bucket,
                Key: convertBackSlashToSlash(join(prefix, pathToFile)),
                Body: createReadStream(resolve(input, pathToFile)),
            }));
        } catch (error) {
            logger.error(pathToFile, error.message);
        }
    }));
}
