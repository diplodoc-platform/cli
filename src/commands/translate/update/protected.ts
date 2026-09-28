/** Inline pieces whose whitespace and localized values are significant. */
export const protectedPattern =
    /`+[^`\r\n]+`+|\]\([^\r\n)]*\)|\{\s*#[^}\s]+\s*\}|<[^>\r\n]+>|\{\{[^}\r\n]+\}\}/g;
export function normalizeProseWhitespace(text: string): string {
    return text.replace(new RegExp(`${protectedPattern.source}|\\s+`, 'g'), (part) =>
        /^\s+$/.test(part) ? ' ' : part,
    );
}
export function tokenKind(token: string): string {
    if (token.startsWith('`')) return 'code';
    if (token.startsWith('](')) return 'link';
    if (/^\{\s*#/.test(token)) return 'anchor';
    if (token.startsWith('<')) return 'html';
    return 'variable';
}
