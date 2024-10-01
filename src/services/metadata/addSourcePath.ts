import {
    emplaceFrontMatter,
    separateAndExtractFrontMatter,
} from '@diplodoc/transform/lib/frontmatter';
import {normalizeLineEndings} from './utils';

export const addSourcePath = (fileContent: string, sourcePath: string) => {
    const {frontMatter, frontMatterStrippedContent} = separateAndExtractFrontMatter(
        fileContent,
        sourcePath,
    );

    return normalizeLineEndings(
        emplaceFrontMatter(frontMatterStrippedContent, {
            ...frontMatter,
            sourcePath,
        }),
    );
};
