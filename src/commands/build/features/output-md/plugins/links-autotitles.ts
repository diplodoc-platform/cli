export async function processAutotitle(
    mdContent: string,
    getTitle: (url: string, baseDir: string) => Promise<string>,
    baseDirPath: string,
): Promise<string> {
    // Ищем все ссылки с маркером {#T}
    const linkRegex = /\[{#T}]\(([^)\s]+)\)/g;

    // Собираем все совпадения с их позициями
    const matches = [];
    let match;
    while ((match = linkRegex.exec(mdContent)) !== null) {
        matches.push({
            fullMatch: match[0],
            url: match[1],
            index: match.index,
        });
    }

    // Заменяем совпадения с конца файла
    let result = mdContent;
    for (let i = matches.length - 1; i >= 0; i--) {
        const {fullMatch, url} = matches[i];
        const newTitle = await getTitle(url, baseDirPath);
        if (newTitle) {
            const newText = `[${newTitle}](${url})`;
            result =
                result.substring(0, matches[i].index) +
                newText +
                result.substring(matches[i].index + fullMatch.length);
        }
    }

    return result;
}
