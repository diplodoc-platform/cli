import { join, resolve } from 'node:path';
import { configPath, deprecated } from '~/config';
import {
    BUNDLE_FOLDER,
    REDIRECTS_FILENAME,
    TMP_INPUT_FOLDER,
    TMP_OUTPUT_FOLDER,
    YFM_CONFIG_FILENAME
} from '~/constants';
import {Logger} from '~/logger';
import {BuildConfig} from '.';

/**
 * This is transferable context for build command.
 * Use this context to communicate with lower data processing levels.
 */
export class Run {
    readonly originalInput: string;

    readonly originalOutput: string;

    readonly input: string;

    readonly output: string;

    readonly logger: Logger;

    get bundlePath() {
        return join(this.originalOutput, BUNDLE_FOLDER);
    }

    get configPath() {
        return this.config[configPath] || join(this.config.input, YFM_CONFIG_FILENAME);
    }

    get redirectsPath() {
        return join(this.originalInput, REDIRECTS_FILENAME);
    }

    constructor(readonly config: BuildConfig) {
        this.originalInput = config.input;
        this.originalOutput = config.output;
        deprecated(this, 'rootInput', () => config.input);

        // TODO: use root instead
        // We need to create system where we can safely work with original input.
        this.input = resolve(config.output, TMP_INPUT_FOLDER);
        this.output = resolve(config.output, TMP_OUTPUT_FOLDER);

        this.logger = new Logger(config, [
            (message) => message.replace(new RegExp(this.input, 'ig'), ''),
        ]);
    }
}
