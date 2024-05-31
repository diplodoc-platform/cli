import type {Build, Run} from '../..';
import type {Command} from '~/config';
import {defined} from '~/config';
import {Run as UploadRun, upload} from '~/commands/publish';
import {options} from './config';

export type PublishingArgs = {
    publish: boolean;
    storageEndpoint: string;
    storageRegion: string;
    storageBucket: string;
    storagePrefix: string;
    storageKeyId: string;
    storageSecretKey: string;
};

export type PublishingConfig = {
    publish: boolean;
} & StorageInfo;

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
            if (args.storageSecretKey || args.storageKeyId) {
                throw new Error('Storage secret key should not be stored in config.');
            }

            config.publish = defined('publish', args, config) || false;

            if (config.publish) {
                props = {
                    endpoint: defined('storageEndpoint', args, config) || '',
                    region:
                        defined('storageRegion', args, config) || options.storageRegion.defaultInfo,
                    bucket: defined('storageBucket', args, config) || '',
                    prefix: defined('storagePrefix', args, config) || '',
                    accessKeyId: defined('storageKeyId', args) || '',
                    secretAccessKey: defined('storageSecretKey', args) || '',
                };
            }

            return config;
        });

        program.hooks.AfterAnyRun.tapPromise('Publishing', async (run: Run) => {
            if (props) {
                await upload(
                    new UploadRun({
                        input: run.output,
                        hidden: run.config.hidden,
                        quiet: run.config.quiet,
                        ...props,
                    }),
                );
            }
        });
    }
}
