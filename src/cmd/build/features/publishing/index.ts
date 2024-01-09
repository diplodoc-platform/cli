import type {Build} from '../..';
import type {Command} from '~/config';
import {options} from './config';
import {defined} from '~/config';

export type PublishingConfig = {
    publish: boolean;
    storageEndpoint: string;
    storageBucket: string;
    storageKeyId: string;
    storageSecretKey: string;
    storageRegion: string;
};

/**
 * This is deprecated build feature.
 * We need to migrate users to separate publish command.
 */
export class Publishing {
    apply(program: Build) {
        program.hooks.Command.tap('Publishing', (command: Command) => {
            command
                .addOption(options.publish)
                .addOption(options.storageEndpoint)
                .addOption(options.storageBucket)
                .addOption(options.storageKeyId)
                .addOption(options.storageSecretKey)
                .addOption(options.storageRegion);
        });

        program.hooks.Config.tap('Publishing', (config, args) => {
            if (config.storageSecretKey) {
                throw new Error('Storage secret key should not be storen in config.');
            }

            config.publish = defined('publish', args, config) || false;
            config.storageKeyId =
                defined('storageKeyId', args, config) || options.storageKeyId.defaultInfo;
            config.storageSecretKey =
                defined('storageSecretKey', args, config) || options.storageSecretKey.defaultInfo;
            config.storageRegion =
                defined('storageRegion', args, config) || options.storageRegion.defaultInfo;

            return config;
        });
    }
}
