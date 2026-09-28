/** Apply literal edits only at the same line in an otherwise equally sized block. */
export function patchLiteralLines(
    before: string,
    after: string,
    target: string,
): string | undefined {
    const oldLines = before.split(/\r?\n/);
    const newLines = after.split(/\r?\n/);
    const targetLines = target.split('\n');
    if (oldLines.length !== newLines.length || oldLines.length !== targetLines.length)
        return undefined;
    const metadata = before.startsWith('---\n') || before.startsWith('---\r\n');
    if (metadata) {
        // Scalar values may be localized; the key path and ordering must match.
        const key = (line: string) => line.match(/^(\s*[\w-]+:)\s*[^|>]*$/)?.[1] ?? line;
        if (
            oldLines.some((line, index) => key(line) !== key(targetLines[index].replace(/\r$/, '')))
        )
            return undefined;
    } else if (before !== target) return undefined;
    for (const [index, oldLine] of oldLines.entries()) {
        if (oldLine === newLines[index]) continue;
        if (!oldLine.trim() || targetLines[index].replace(/\r$/, '') !== oldLine) return undefined;
        targetLines[index] = newLines[index] + (targetLines[index].endsWith('\r') ? '\r' : '');
    }
    return targetLines.join('\n');
}

export function patchInclude(before: string, after: string, target: string): string | undefined {
    const pattern = /^(\s*{%\s*include\s+\[[^\]]*\]\()([^)]+)(\)\s*%})$/;
    const previous = before.match(pattern),
        updated = after.match(pattern),
        translated = target.match(pattern);
    if (
        !previous ||
        !updated ||
        !translated ||
        previous[1] !== updated[1] ||
        previous[3] !== updated[3] ||
        previous[2] !== translated[2]
    )
        return undefined;
    return translated[1] + updated[2] + translated[3];
}

/** A link-only source delta needs no prose regeneration, including reordered target links. */
export function patchLinks(
    before: string,
    after: string,
    target: string,
): {output?: string} | null {
    const pattern = /\]\([^\r\n)]*\)/g;
    const previous = before.match(pattern) ?? [],
        updated = after.match(pattern) ?? [];
    if (
        before.replace(pattern, ']()') !== after.replace(pattern, ']()') ||
        previous.length !== updated.length
    )
        return null;
    const replacements = new Map<string, string>();
    for (const [index, link] of previous.entries()) {
        if (link === updated[index]) continue;
        if (previous.some((other, offset) => other === link && updated[offset] !== updated[index]))
            return {};
        replacements.set(link, updated[index]);
    }
    // Destination chains and swaps cannot distinguish old links from already applied ones.
    if ([...replacements.values()].some((value) => replacements.has(value))) return {};
    const translated = target.match(pattern) ?? [];
    for (const [link, replacement] of replacements) {
        const count = (links: string[], value: string) =>
            links.filter((other) => other === value).length;
        if (count(translated, link) === count(previous, link)) continue;
        // The exact new destination may already have landed in the translation.
        if (
            count(translated, link) === 0 &&
            [...replacements.values()].filter((value) => value === replacement).length === 1 &&
            count(translated, replacement) === count(updated, replacement)
        )
            continue;
        return {};
    }
    return {output: target.replace(pattern, (link) => replacements.get(link) ?? link)};
}
