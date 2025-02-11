import type {BaseArgs} from '~/core/program';

import {ok} from 'assert';

import {
    BaseProgram,
    getHooks as getBaseHooks,
    withConfigDefaults,
    withConfigScope,
} from '~/core/program';
import {Command} from '~/core/config';
import {YFM_CONFIG_FILENAME} from '~/constants';

import {options} from './config';
import {upload} from './upload';
import {Run} from './run';

export {upload, Run};

export type PublishArgs = BaseArgs & {
    endpoint: string;
    bucket: string;
    prefix: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    hidden: string[];
};

export type PublishConfig = Pick<BaseArgs, 'input' | 'strict' | 'quiet'> & {
    endpoint: string;
    bucket: string;
    prefix: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    hidden: string[];
};

@withConfigScope('publish', {strict: true})
@withConfigDefaults(() => ({
    endpoint: 'https://s3.amazonaws.com',
    region: 'eu-central-1',
    prefix: '',
}))
export class Publish extends BaseProgram<PublishConfig, PublishArgs> {
    readonly name = 'Publish';

    readonly command = new Command('publish').description(
        'Publish built documentation in target aws s3 compatible storage.',
    );

    readonly options = [
        options.input('./'),
        options.endpoint,
        options.bucket,
        options.prefix,
        options.accessKeyId,
        options.secretAccessKey,
        options.config(YFM_CONFIG_FILENAME),
        options.region,
        options.hidden,
    ];

    apply(program?: BaseProgram) {
        super.apply(program);

        getBaseHooks(this).RawConfig.tap('Publish', (config) => {
            ok(!config.accessKeyId, 'Do not store `accessKeyId` in public config');
            ok(!config.secretAccessKey, 'Do not store `secretAccessKey` in public config');
        });

        getBaseHooks(this).Config.tap('Publish', (config) => {
            ok(config.endpoint, 'Required `endpoint` prop is not specified or empty');
            ok(config.bucket, 'Required `bucket` prop is not specified or empty');
            ok(config.region, 'Required `region` prop is not specified or empty');

            return config;
        });
    }

    async action() {
        const run = new Run(this.config);

        await upload(run);
    }
}
