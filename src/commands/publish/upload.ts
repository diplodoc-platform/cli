import type {Run} from './run';
import {join} from 'path';
import {asyncify, mapLimit} from 'async';
import walkSync from 'walk-sync';
import mime from 'mime-types';
import {LogLevel} from '~/core/logger';

export async function upload(run: Run): Promise<void> {
    const {input, endpoint, bucket, prefix, hidden = []} = run.config;
    const logUpload = run.logger.topic(LogLevel.INFO, 'UPLOAD');
    const filesToPublish: string[] = walkSync(run.root, {
        directories: false,
        includeBasePath: false,
        ignore: hidden,
    });

    run.logger.info(`Upload artifacts from ${input} to ${join(endpoint, bucket, prefix)}`);

    await mapLimit(
        filesToPublish,
        100,
        asyncify(async (pathToFile: string) => {
            const mimeType = mime.lookup(pathToFile);

            logUpload(pathToFile);

            try {
                await run.send(pathToFile, mimeType);
                // eslint-disable-next-line  @typescript-eslint/no-explicit-any
            } catch (error: any) {
                run.logger.error(pathToFile, error.message);
            }
        }),
    );
}
