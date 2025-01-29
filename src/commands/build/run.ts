import type {BuildConfig} from '.';

import {join, resolve} from 'node:path';

import {configPath} from '~/core/config';
import {
    ASSETS_FOLDER,
    BUNDLE_FOLDER,
    REDIRECTS_FILENAME,
    TMP_INPUT_FOLDER,
    TMP_OUTPUT_FOLDER,
    YFM_CONFIG_FILENAME,
} from '~/constants';
import {Run as BaseRun} from '~/core/run';
import {VarsService} from '~/core/vars';
import {TocService} from '~/core/toc';

/**
 * This is transferable context for build command.
 * Use this context to communicate with lower data processing levels.
 */
export class Run extends BaseRun<BuildConfig> {
    readonly originalInput: AbsolutePath;

    readonly input: AbsolutePath;

    readonly originalOutput: AbsolutePath;

    readonly output: AbsolutePath;

    readonly vars: VarsService;

    readonly toc: TocService;

    get configPath() {
        return this.config[configPath] || join(this.config.input, YFM_CONFIG_FILENAME);
    }

    get bundlePath() {
        return join(this.output, BUNDLE_FOLDER);
    }

    get assetsPath() {
        return join(this.output, ASSETS_FOLDER);
    }

    get redirectsPath() {
        return join(this.originalInput, REDIRECTS_FILENAME);
    }

    constructor(config: BuildConfig) {
        super(config);

        this.originalInput = config.input;
        this.originalOutput = config.output;
        this.input = resolve(config.output, TMP_INPUT_FOLDER);
        this.output = resolve(config.output, TMP_OUTPUT_FOLDER);

        // Sequence is important for scopes.
        // Otherwise logger will replace originalOutput instead of output.
        this.scopes.set('<input>', this.input);
        this.scopes.set('<output>', this.output);
        this.scopes.set('<origin>', this.originalInput);
        this.scopes.set('<result>', this.originalOutput);

        this.vars = new VarsService(this);
        this.toc = new TocService(this);
    }
}
