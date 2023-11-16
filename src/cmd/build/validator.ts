import type {Build} from './index';
import type {Arguments} from 'yargs';
import {join, resolve} from 'path';
import {readFile} from 'node:fs/promises';
import {load} from 'js-yaml';
import merge from 'lodash/merge';
import log from '@diplodoc/transform/lib/log';
import {LINT_CONFIG_FILENAME, YFM_CONFIG_FILENAME} from '../../constants';
import {ConnectorValidatorProps} from './vcs-connector/connector-models';

function notEmptyStringValidator(value: unknown): Boolean {
    if (typeof value === 'string') {
        return Boolean(value);
    }

    return false;
}

function requiredValueValidator(value: unknown): Boolean {
    return Boolean(value);
}

const validators: Record<string, ConnectorValidatorProps> = {
    storageEndpoint: {
        errorMessage: 'Endpoint of S3 storage must be provided when publishes.',
        validateFn: notEmptyStringValidator,
    },
    storageBucket: {
        errorMessage: 'Bucket name of S3 storage must be provided when publishes.',
        validateFn: notEmptyStringValidator,
    },
    storageKeyId: {
        errorMessage: 'Key Id of S3 storage must be provided when publishes.',
        validateFn: notEmptyStringValidator,
        defaultValue: process.env.YFM_STORAGE_KEY_ID,
    },
    storageSecretKey: {
        errorMessage: 'Secret key of S3 storage must be provided when publishes.',
        validateFn: notEmptyStringValidator,
        defaultValue: process.env.YFM_STORAGE_SECRET_KEY,
    },
    storageRegion: {
        errorMessage: 'Region of S3 storage must be provided when publishes.',
        validateFn: notEmptyStringValidator,
        defaultValue: 'eu-central-1',
    },
};

async function validateBuildConfigFile(argv: Arguments<Object>) {
    try {
        // Combine passed argv and properties from configuration file.
        const pathToConfig = join(String(argv.input), argv.config);
        const content = await readFile(resolve(pathToConfig), 'utf8');

        Object.assign(argv, load(content) || {});
    } catch (error: any) {
        if (error.name === 'YAMLException') {
            log.error(`Error to parse ${argv.config}: ${error.message}`);
        } else if (error.name === 'ENOENT' && argv.config === YFM_CONFIG_FILENAME) {
            return;
        } else {
            throw error;
        }
    }
}

async function validateLintConfigFile(argv: Arguments<Object>) {
    let lintConfig: unknown = {};
    try {
        const pathToConfig = join(String(argv.input), LINT_CONFIG_FILENAME);
        const content = await readFile(resolve(pathToConfig), 'utf8');

        lintConfig = load(content) || {};
    } catch (error: any) {
        if (error.name === 'YAMLException') {
            log.error(`Error to parse ${LINT_CONFIG_FILENAME}: ${error.message}`);
        }
    } finally {
        const preparedLintConfig = merge(lintConfig, {
            'log-levels': {
                MD033: argv.allowHTML ? 'disabled' : 'error',
            },
        });

        Object.assign(argv, {lintConfig: preparedLintConfig});
    }
}

export async function argvValidator(argv: Arguments<Object>): Boolean {
    await validateBuildConfigFile(argv);
    await validateLintConfigFile(argv);

    if (argv.publish) {
        for (const [field, validator] of Object.entries(validators)) {
            const value = argv[field] ?? validator.defaultValue;

            if (!validator) {
                continue;
            }

            const validateFn = validator.validateFn ?? requiredValueValidator;

            if (!validateFn(value)) {
                throw new Error(validator.errorMessage);
            }

            argv[field] = value;
        }
    }

    return true;
}

export function validate(build: Build) {
    build.hooks.Validate.tap('BuildConfigFile', validateBuildConfigFile);
    build.hooks.Validate.tap('LintConfigFile', validateLintConfigFile);
}
