import {
    emplaceFrontMatter,
    separateAndExtractFrontMatter,
} from '@diplodoc/transform/lib/frontmatter';
import liquid from '@diplodoc/transform/lib/liquid';
import {readFile} from 'fs/promises';
import {normalizeLineEndings} from '../../../src/services/metadata/utils';

const propValuesMockPath = 'mocks/fileContent/metadata/substitutionsInMetadataPropertyValues.md';
const propKeysMockPath = 'mocks/fileContent/metadata/substitutionsInMetadataPropertyKeys.md';
const emptyStringMockPath = 'mocks/fileContent/metadata/substitutionsWithEmptyString.md';

describe('Front matter (metadata) transformations', () => {
    it('do not break when a property value contains Liquid-style variable substitutions', async () => {
        const fileContent = await readFile(propValuesMockPath, {encoding: 'utf-8'});

        const {frontMatter, frontMatterStrippedContent} =
            separateAndExtractFrontMatter(fileContent);
        const processedContent = normalizeLineEndings(
            emplaceFrontMatter(frontMatterStrippedContent, frontMatter),
        );

        expect(frontMatter).toMatchSnapshot();
        expect(processedContent).toMatchSnapshot();
    });

    it('emit valid metadata when a variable is substituted with an ampty string', async () => {
        const fileContent = await readFile(emptyStringMockPath, {encoding: 'utf-8'});

        const {frontMatter, frontMatterStrippedContent} =
            separateAndExtractFrontMatter(fileContent);
        const processedContent = normalizeLineEndings(
            emplaceFrontMatter(frontMatterStrippedContent, frontMatter),
        );

        const liquidProcessedInput = liquid(processedContent, {var: ''});

        expect(liquidProcessedInput).toMatchSnapshot();
    });
});
