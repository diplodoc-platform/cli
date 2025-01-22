import type {IProgram, ProgramArgs, ProgramConfig} from '~/program';
import {ok} from 'assert';
import {pick} from 'lodash';
import {BaseProgram} from '~/program/base';
import {Command} from '~/core/config';
import {YFM_CONFIG_FILENAME} from '~/constants';
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
            defaults: () => ({
                endpoint: 'https://s3.amazonaws.com',
                region: 'eu-central-1',
                prefix: '',
            }),
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

    apply(program?: IProgram) {
        super.apply(program);

        this.hooks.Config.tap('Publish', (config, args) => {
            const options = this.options.map((option) => option.attributeName());

            ok(!config.accessKeyId, 'Do not store `accessKeyId` in public config');
            ok(!config.secretAccessKey, 'Do not store `secretAccessKey` in public config');

            Object.assign(config, pick(args, options));

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
