const fragmentPrefix = '<!-- translation-fragment-';
const fragmentMarker = /^<!-- translation-fragment-(\d+) -->[ \t]*$/m;

/** Put fragment boundaries in Markdown comments outside the translation units. */
export function planFragments(
    fragments: readonly string[],
    apply: (translations: readonly string[]) => string,
) {
    const unique = [...new Set(fragments)];
    if (unique.some((text) => !text.trim() || text.includes(fragmentPrefix))) {
        throw new Error('Empty or ambiguous translation fragment');
    }
    const input =
        unique.length <= 1
            ? (unique[0] ?? '')
            : unique.map((text, index) => `${fragmentPrefix}${index} -->\n\n${text}`).join('\n\n');

    return {
        input,
        apply(result: string) {
            const translated = new Map<string, string>();
            if (unique.length === 1) {
                if (!result.trim() || result.includes(fragmentPrefix)) {
                    throw new Error('Missing or ambiguous translated fragment');
                }
                translated.set(unique[0], result.trim());
            } else if (unique.length) {
                const pieces = result.trim().split(fragmentMarker);
                if (pieces.shift()?.trim() || pieces.length !== 2 * unique.length) {
                    throw new Error('Incomplete translated fragments');
                }
                for (const [index, original] of unique.entries()) {
                    const text = pieces[2 * index + 1].trim();
                    if (
                        pieces[2 * index] !== String(index) ||
                        !text ||
                        text.includes(fragmentPrefix)
                    ) {
                        throw new Error('Unexpected translated fragment');
                    }
                    translated.set(original, text);
                }
            } else if (result.trim()) {
                throw new Error('Unexpected translated text for a structural change');
            }
            return apply(fragments.map((text) => translated.get(text)!));
        },
    };
}
