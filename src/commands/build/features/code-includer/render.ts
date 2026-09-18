export function renderCodeFence(content: string, lang = '') {
    let longestBacktickRun = 0;
    for (const sequence of content.match(/`+/g) || []) {
        longestBacktickRun = Math.max(longestBacktickRun, sequence.length);
    }
    const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1));
    const ending = content.endsWith('\n') ? '' : '\n';

    return `${fence}${lang}\n${content}${ending}${fence}`;
}
