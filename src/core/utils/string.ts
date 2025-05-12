export function replaceAll(string: string, match: string, replace: string) {
    if (!string) {
        return string;
    }

    const matches = [];

    let index = -1;
    while ((index = string.indexOf(match, index + 1)) > -1) {
        matches.push([index, index + match.length]);
    }

    return matches.reduceRight((string, match) => {
        return string.slice(0, match[0]) + replace + string.slice(match[1]);
    }, string);
}
