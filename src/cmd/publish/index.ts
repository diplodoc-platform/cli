import type {IProgram, ProgramArgs, ProgramConfig} from '~/program';
import {join} from 'path';

import {BaseProgram} from '~/program/base';
import {Command} from '~/config';
import {options} from './config';
import {upload} from './upload';
import {Run} from './run';

export {upload, Run};

export type PublishArgs = ProgramArgs & {
    endpoint: string;
    bucket: string;
    prefix: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    hidden: string[];
};

export type PublishConfig = Pick<ProgramConfig, 'input' | 'strict' | 'quiet'> & {
    endpoint: string;
    bucket: string;
    prefix: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    hidden: string[];
};

export class Publish
    // eslint-disable-next-line new-cap
    extends BaseProgram<PublishConfig, PublishArgs, {}>('Publish', {
        config: {
            defaults: () => ({}),
            strictScope: 'publish',
        },
        hooks: {},
    })
    implements IProgram<PublishArgs>
{
    readonly command = new Command('publish').description(
        'Publish built documentation in target aws s3 compatible storage.',
    );

    readonly options = [
        options.endpoint,
        options.bucket,
        options.prefix,
        options.accessKeyId,
        options.secreAccessKey,
        options.region,
        options.hidden,
    ];

    async action() {
        const run = new Run(this.config);

        await this.handler(run);
    }

    async handler(run: Run) {
        const {input, endpoint, bucket, prefix} = this.config;

        this.logger.info(`Upload artifacts from ${input} to ${join(endpoint, bucket, prefix)}`);

        try {
            await upload(run);
            // eslint-disable-next-line  @typescript-eslint/no-explicit-any
        } catch (error: any) {
            this.logger.error(error.message || error);
        }
    }
}
