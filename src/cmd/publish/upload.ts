import type {Run} from './run';
import {asyncify, mapLimit} from 'async';
import walkSync from 'walk-sync';
import mime from 'mime-types';
import {LogLevel} from '~/logger';

export async function upload(run: Run): Promise<void> {
    const {hidden = []} = run.config;

    const filesToPublish: string[] = walkSync(run.root, {
        directories: false,
        includeBasePath: false,
        ignore: hidden,
    });

    const logUpload = run.logger.topic(LogLevel.INFO, 'UPLOAD');

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
