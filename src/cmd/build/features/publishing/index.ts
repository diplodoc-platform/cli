import type {Build, Run} from '../..';
import type {Command} from '~/config';
import {options} from './config';
import {defined} from '~/config';
import {upload} from '~/cmd/publish/upload';
import {MultiHook} from 'tapable';

export type PublishingConfig = {
    publish: boolean;
    endpoint: string;
    region: string;
    bucket: string;
    prefix: string;
    accessKeyId: string;
    secretAccessKey: string;
};

type StorageInfo = {
    endpoint: string;
    region: string;
    bucket: string;
    prefix: string;
    accessKeyId: string;
    secretAccessKey: string;
};

/**
 * This is deprecated build feature.
 * We need to migrate users to separate publish command.
 */
export class Publishing {
    apply(program: Build) {
        let props: StorageInfo | null = null;

        program.hooks.Command.tap('Publishing', (command: Command) => {
            command
                .addOption(options.publish)
                .addOption(options.storageEndpoint)
                .addOption(options.storageRegion)
                .addOption(options.storageBucket)
                .addOption(options.storagePrefix)
                .addOption(options.storageKeyId)
                .addOption(options.storageSecretKey);
        });

        program.hooks.Config.tap('Publishing', (config, args) => {
            if (config.storageSecretKey || config.storageKeyId) {
                throw new Error('Storage secret key should not be storen in config.');
            }

            const publish = defined('publish', args, config) || false;

            if (publish) {
                props = {
                    endpoint: defined('storageEndpoint', args, config) || '',
                    region: defined('storageRegion', args, config) || options.storageRegion.defaultInfo,
                    bucket: defined('storageBucket', args, config) || '',
                    prefix: defined('storagePrefix', args, config) || '',
                    accessKeyId: defined('storageKeyId', args) || '',
                    secretAccessKey: defined('storageSecretKey', args) || '',
                };
            }

            return config;
        });

        new MultiHook([
            program.hooks.AfterRun.for('md'),
            program.hooks.AfterRun.for('html'),
        ], 'AfterRun').tap('Publishing', async (run: Run) => {
            if (props) {
                await upload({
                    input: run.output,
                    ignore: run.config.ignore,
                    ...props,
                });
            }
        });
    }
}
