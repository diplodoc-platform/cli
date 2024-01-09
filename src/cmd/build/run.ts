import {deprecated} from '~/config';
import {resolve} from 'node:path';
import {TMP_INPUT_FOLDER, TMP_OUTPUT_FOLDER} from '~/constants';
import {Logger} from '~/logger';
import {BuildConfig} from '~/cmd/build/index';

/**
 * This is transferable context for build command.
 * Use this context to communicate with lower data processing levels.
 */
export class Run {
    readonly root: string;

    readonly input: string;

    readonly output: string;

    readonly logger: any;

    constructor(readonly config: BuildConfig) {
        this.root = config.input;
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
