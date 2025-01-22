import {composeFrontMatter, extractFrontMatter} from '@diplodoc/transform/lib/frontmatter';

export function addSourcePath(fileContent: string, sourcePath: string) {
    const [frontMatter, strippedContent] = extractFrontMatter(fileContent, sourcePath);

    if (frontMatter.sourcePath) {
        return fileContent;
    }

    return composeFrontMatter(
        {
            ...frontMatter,
            sourcePath,
        },
        strippedContent,
    );
}
