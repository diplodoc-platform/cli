import liquid from '@diplodoc/transform/lib/liquid';
import {readFile} from 'fs/promises';
import {parseExistingMetadata} from 'services/metadata/parse';
import {emplaceMetadata} from 'services/metadata/utils';

const propValuesMockPath = 'mocks/fileContent/metadata/substitutionsInMetadataPropertyValues.md';
const propKeysMockPath = 'mocks/fileContent/metadata/substitutionsInMetadataPropertyKeys.md';
const emptyStringMockPath = 'mocks/fileContent/metadata/substitutionsWithEmptyString.md';

describe('Front matter (metadata) transformations', () => {
    it('do not break when a property value contains Liquid-style variable substitutions', async () => {
        const fileContent = await readFile(propValuesMockPath, {encoding: 'utf-8'});

        const {metadata, metadataStrippedContent} = parseExistingMetadata(fileContent);
        const processedContent = emplaceMetadata(metadataStrippedContent, metadata);

        expect(metadata).toMatchSnapshot();
        expect(processedContent).toMatchSnapshot();
    });

    it('do not break when a property key contains Liquid-style variable substitutions', async () => {
        const fileContent = await readFile(propKeysMockPath, {encoding: 'utf-8'});

        const {metadata, metadataStrippedContent} = parseExistingMetadata(fileContent);
        const processedContent = emplaceMetadata(metadataStrippedContent, metadata);

        expect(metadata).toMatchSnapshot();
        expect(processedContent).toMatchSnapshot();
    });

    it('emit valid metadata when a variable is substituted with an ampty string', async () => {
        const fileContent = await readFile(emptyStringMockPath, {encoding: 'utf-8'});

        const {metadata, metadataStrippedContent} = parseExistingMetadata(fileContent);
        const processedContent = emplaceMetadata(metadataStrippedContent, metadata);

        const liquidProcessedInput = liquid(processedContent, {var: ''});

        expect(liquidProcessedInput).toMatchSnapshot();
    });
});
