import {Arguments} from 'yargs';
import {join, resolve} from 'path';
import {readFileSync} from 'fs';
import {load} from 'js-yaml';
import log from '@doc-tools/transform/lib/log';

function notEmptyStringValidator(value: string): Boolean {
    return Boolean(value) && Boolean(value?.length);
}

function requiredValueValidator(value: unknown): Boolean {
    return Boolean(value);
}

interface ValidatorProps {
    errorMessage?: string;
    validateFn?: (value: any) => Boolean;
    defaultValue?: any;
}

const validators: Record<string, ValidatorProps> = {
    'storageEndpoint': {
        errorMessage: 'Endpoint of S3 storage must be provided when publishes.',
        validateFn: notEmptyStringValidator,
    },
    'storageBucket': {
        errorMessage: 'Bucket name of S3 storage must be provided when publishes.',
        validateFn: notEmptyStringValidator,
    },
    'storageKeyId': {
        errorMessage: 'Key Id of S3 storage must be provided when publishes.',
        validateFn: notEmptyStringValidator,
        defaultValue: process.env.YFM_STORAGE_KEY_ID,
    },
    'storageSecretKey': {
        errorMessage: 'Secret key of S3 storage must be provided when publishes.',
        validateFn: notEmptyStringValidator,
        defaultValue: process.env.YFM_STORAGE_SECRET_KEY,
    },
};

export function argvValidator(argv: Arguments<Object>): Boolean {
    try {
        // Combine passed argv and properties from configuration file.
        const pathToConfig = argv.config ? String(argv.config) : join(String(argv.input), '.yfm');
        const content = readFileSync(resolve(pathToConfig), 'utf8');
        Object.assign(argv, load(content) || {});
    } catch (error) {
        if (error.name === 'YAMLException') {
            log.error(`Error to parse .yfm: ${error.message}`);
        }
    }

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
