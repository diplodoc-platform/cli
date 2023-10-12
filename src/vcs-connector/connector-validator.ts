import log from '@diplodoc/transform/lib/log';
import {
    ConnectorValidatorProps,
    GitHubConnectorFields,
    SourceType,
    VCSConnectorConfig,
} from './connector-models';
import {getMsgСonfigurationMustBeProvided} from '../constants';

const githubConnectorValidator: Record<string, ConnectorValidatorProps> = {
    [GitHubConnectorFields.ENDPOINT]: {
        warnMessage: `'${GitHubConnectorFields.ENDPOINT}' must be provided for GitHub repo.`,
        validateFn: notEmptyValue,
        defaultValue: process.env.GITHUB_BASE_URL,
    },
    [GitHubConnectorFields.TOKEN]: {
        warnMessage: `'${GitHubConnectorFields.TOKEN}' must be provided for GitHub repo.`,
        validateFn: notEmptyValue,
        defaultValue: process.env.GITHUB_TOKEN,
    },
    [GitHubConnectorFields.OWNER]: {
        warnMessage: `'${GitHubConnectorFields.OWNER}' must be provided for GitHub repo.`,
        validateFn: notEmptyValue,
        defaultValue: process.env.GITHUB_OWNER,
    },
    [GitHubConnectorFields.REPO]: {
        warnMessage: `'${GitHubConnectorFields.REPO}' must be provided for GitHub repo.`,
        validateFn: notEmptyValue,
        defaultValue: process.env.GITHUB_REPO,
    },
};

const connectorValidator: Record<string, ConnectorValidatorProps> = {
    type: {
        warnMessage: "'type' must be provided for repo.",
        validateFn: notEmptyValue,
    },
    [SourceType.GITHUB]: {
        warnMessage: `'${SourceType.GITHUB}' object must be filled needed fields.`,
        validateFn: notEmptyObject,
        relatedValidator: githubConnectorValidator,
    },
};

function notEmptyObject(filed?: unknown): boolean {
    if (typeof filed === 'object') {
        return Boolean(filed && Object.getOwnPropertyNames(filed).length);
    }

    return false;
}

function notEmptyValue(value?: unknown): boolean {
    if (typeof value === 'string') {
        return Boolean(value);
    }

    return false;
}

export function validateConnectorFields(
    sourceType: SourceType,
    fieldNames: GitHubConnectorFields[],
    repoProperties?: VCSConnectorConfig,
): Record<string, unknown> {
    const repoValidator = connectorValidator[sourceType];

    if (!repoValidator) {
        log.error(`Invalid repo type: ${repoValidator}`);
        return {};
    }

    const isValidRepo = repoValidator.validateFn(repoProperties && repoProperties[sourceType]);
    const relatedRepoValidator = repoValidator.relatedValidator;
    if (!repoProperties || !isValidRepo || !relatedRepoValidator) {
        createLog(repoValidator);
        return {};
    }

    let isValidProperties = true;
    const validatedFields: Record<string, unknown> = {};

    for (const property of fieldNames) {
        const propertyValidator = relatedRepoValidator[property];

        if (!propertyValidator) {
            log.warn(`The property '${property}' doesn't exist in ${sourceType} repo.`);
            continue;
        }

        const propertyValue =
            propertyValidator.defaultValue || repoProperties[sourceType]?.[property];

        if (!propertyValidator.validateFn(propertyValue)) {
            createLog(propertyValidator);
            isValidProperties = false;
        }

        validatedFields[property] = propertyValue;
    }

    if (isValidProperties) {
        return validatedFields;
    }

    log.warn(getMsgСonfigurationMustBeProvided(sourceType));
    return {};
}

function createLog(validator: ConnectorValidatorProps): void {
    if (validator.errorMessage) {
        return log.error(validator.errorMessage);
    }

    if (validator.warnMessage) {
        return log.warn(validator.warnMessage);
    }

    throw new Error(`Invalid validator: ${JSON.stringify(validator)}.`);
}
