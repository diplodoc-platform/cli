/** Accept one complete fence, without an earlier close or text after its closing line. */
function completeCodeFence(text: string): boolean {
    const lines = text.split(/\r?\n/);
    const opening = lines[0].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!opening || lines.length < 2) {
        return false;
    }
    const fence = opening[1];
    // Backticks in the info string make this an inline span or an invalid opening fence.
    if (fence[0] === '`' && opening[2].includes('`')) {
        return false;
    }
    const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \t]*$`);
    return (
        closing.test(lines[lines.length - 1]) &&
        !lines.slice(1, -1).some((line) => closing.test(line))
    );
}

/** Copy exact complete code blocks; otherwise edit only matching lines of equally sized blocks. */
export function patchLiteralLines(
    before: string,
    after: string,
    target: string,
): string | undefined {
    // Correspondence and repeated-block guards belong to the caller. Here both snapshots
    // must be complete code fences, and the mapped target must match one byte for byte.
    if (completeCodeFence(before) && completeCodeFence(after)) {
        if (target === after) {
            return target;
        }
        if (target === before) {
            return after;
        }
    }
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

/** A single changed table number can be copied without retranslating its prose. */
export function patchTableNumber(
    before: string,
    after: string,
    target: string,
): {output?: string} | null {
    const pattern = /\b\d+(?:\.\d+)?\b/g;
    const oldNumbers = [...before.matchAll(pattern)],
        newNumbers = [...after.matchAll(pattern)];
    if (oldNumbers.length !== newNumbers.length) return null;
    const changed = oldNumbers.flatMap((match, index) =>
        match[0] === newNumbers[index][0] ? [] : [index],
    );
    if (changed.length !== 1) return null;
    const previous = oldNumbers[changed[0]],
        next = newNumbers[changed[0]][0];
    const offset = previous.index;
    if (
        offset === undefined ||
        before.slice(0, offset) + next + before.slice(offset + previous[0].length) !== after
    )
        return null;
    const code = /`[^`\r\n]+`/g;
    const oldCodes = [...before.matchAll(code)],
        newCodes = [...after.matchAll(code)],
        targetCodes = [...target.matchAll(code)];
    const value = oldCodes[1];
    if (
        !value ||
        !newCodes[1] ||
        value.index === undefined ||
        offset < value.index ||
        offset + previous[0].length > value.index + value[0].length ||
        oldCodes[0]?.[0] !== newCodes[0]?.[0]
    )
        return null;
    if (oldCodes[0][0] !== targetCodes[0]?.[0]) return {};
    if (targetCodes[1]?.[0] === newCodes[1]?.[0]) return {output: target};
    if (targetCodes[1]?.[0] !== value[0]) return {};
    const targetOffset = targetCodes[1].index;
    if (targetOffset === undefined) return {};
    return {
        output:
            target.slice(0, targetOffset) +
            newCodes[1][0] +
            target.slice(targetOffset + value[0].length),
    };
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
