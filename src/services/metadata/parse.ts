import {dump, load} from 'js-yaml';
import {metadataBorder} from '../../constants';

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

export const parseExistingMetadata = (fileContent: string): ParseExistingMetadataReturn => {
    const matches = matchMetadata(fileContent);

    if (matches && matches.length > 0) {
        const [, metadata, , metadataStrippedContent] = matches;

        return {
            metadata: load(escapeLiquidSubstitutionSyntax(metadata)) as FileMetadata,
            metadataStrippedContent,
        };
    }

    return {
        metadata: {},
        metadataStrippedContent: fileContent,
    };
};

export const serializeMetadata = (objectMetadata: FileMetadata) => {
    const dumped = unescapeLiquidSubstitutionSyntax(dump(objectMetadata).trimEnd());

    // This empty object check is a bit naive
    // The other option would be to check if all own fields are `undefined`,
    // since we exploit passing in `undefined` to remove a field quite a bit
    if (dumped === '{}') {
        return '';
    }

    return `${metadataBorder}\n${dumped}\n${metadataBorder}\n`;
};
