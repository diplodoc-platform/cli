import {YAMLException, dump, load} from 'js-yaml';
import {metadataBorder} from '../../constants';
import {logger} from '../../utils';

export type FileMetadata = {
    [key: string]: unknown;
    metadata?: Record<string, unknown>[];
};

type ParseExistingMetadataReturn = {
    metadata: FileMetadata;
    metadataStrippedContent: string;
};

const matchMetadata = (fileContent: string) => {
    if (!fileContent.startsWith('---')) {
        return null;
    }

    // Search by format:
    // ---
    // metaName1: metaValue1
    // metaName2: meta value2
    // incorrectMetadata
    // ---
    const regexpMetadata = '(?<=-{3}\\r?\\n)((.*\\r?\\n)*?)(?=-{3}\\r?\\n)';
    // Search by format:
    // ---
    // main content 123
    const regexpFileContent = '-{3}\\r?\\n((.*[\r?\n]*)*)';

    const regexpParseFileContent = new RegExp(`${regexpMetadata}${regexpFileContent}`, 'gm');

    return regexpParseFileContent.exec(fileContent);
};

const duplicateKeysCompatibleLoad = (yaml: string, filePath: string | undefined) => {
    try {
        return load(yaml);
    } catch (e) {
        if (e instanceof YAMLException) {
            const duplicateKeysDeprecationWarning = `
                Encountered a YAML parsing exception when processing file metadata: ${e.reason}.
                It's highly possible the input file contains duplicate mapping keys.
                Will retry processing with necessary compatibility flags.
                Please note that this behaviour is DEPRECATED and WILL be removed in a future version
                without further notice, so the build WILL fail when supplied with YAML-incompatible meta.
            `
                .replace(/^\s+/gm, '')
                .replace(/\n/g, ' ')
                .trim();

            logger.warn(filePath ?? '', duplicateKeysDeprecationWarning);

            return load(yaml, {json: true});
        }

        throw e;
    }
};

/**
 * Temporary workaround to enable parsing YAML metadata from potentially
 * Liquid-aware source files
 * @param content Input string which could contain Liquid-style substitution syntax (which clashes with YAML
 * object syntax)
 * @returns String with `{}` escaped, ready to be parsed with `js-yaml`
 */
const escapeLiquidSubstitutionSyntax = (content: string): string =>
    content.replace(/{{/g, '(({{').replace(/}}/g, '}}))');

/**
 * Inverse of a workaround defined above.
 * @see `escapeLiquidSubstitutionSyntax`
 * @param escapedContent Input string with `{}` escaped with backslashes
 * @returns Unescaped string
 */
const unescapeLiquidSubstitutionSyntax = (escapedContent: string): string =>
    escapedContent.replace(/\(\({{/g, '{{').replace(/}}\)\)/g, '}}');

export const parseExistingMetadata = (
    fileContent: string,
    filePath?: string,
): ParseExistingMetadataReturn => {
    const matches = matchMetadata(fileContent);

    if (matches && matches.length > 0) {
        const [, metadata, , metadataStrippedContent] = matches;

        return {
            metadata: duplicateKeysCompatibleLoad(
                escapeLiquidSubstitutionSyntax(metadata),
                filePath,
            ) as FileMetadata,
            metadataStrippedContent,
        };
    }

    return {
        metadata: {},
        metadataStrippedContent: fileContent,
    };
};

export const serializeMetadata = (objectMetadata: FileMetadata) => {
    const dumped = unescapeLiquidSubstitutionSyntax(
        dump(objectMetadata, {forceQuotes: true}).trimEnd(),
    );

    // This empty object check is a bit naive
    // The other option would be to check if all own fields are `undefined`,
    // since we exploit passing in `undefined` to remove a field quite a bit
    if (dumped === '{}') {
        return '';
    }

    return `${metadataBorder}\n${dumped}\n${metadataBorder}\n`;
};
