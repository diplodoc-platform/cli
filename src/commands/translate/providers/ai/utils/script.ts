/**
 * CLDR composite script codes (ISO 15924) that are not valid Unicode
 * script property values: expanded into their component scripts.
 */
const COMPOSITE_SCRIPTS: Record<string, string[]> = {
    Hans: ['Han'],
    Hant: ['Han'],
    Jpan: ['Han', 'Hiragana', 'Katakana'],
    Kore: ['Hangul', 'Han'],
};

/** Unicode scripts a language is written in, from the CLDR likely-subtags data. */
export function scriptsOf(language: string): string[] {
    try {
        const script = new Intl.Locale(language).maximize().script;
        if (!script) {
            return [];
        }

        return COMPOSITE_SCRIPTS[script] || [script];
    } catch {
        return [];
    }
}

/**
 * Returns a regexp matching source-script characters that must not survive
 * translation, or null when the pair cannot be discriminated by script and
 * identity responses have to be trusted. The script of a language comes
 * from the CLDR likely-subtags data, so any language known to the runtime
 * is supported. Scripts shared with the target do not discriminate (e.g.
 * only kana counts for ja -> zh). A Latin source never discriminates:
 * code, identifiers and product names are Latin in documents of any
 * language, so a Latin identity response cannot be told apart from a
 * legitimately untranslatable unit.
 */
export function untranslatedMarker(sourceLanguage: string, targetLanguage: string): RegExp | null {
    const target = new Set(scriptsOf(targetLanguage));
    const source = scriptsOf(sourceLanguage).filter(
        (script) => script !== 'Latn' && !target.has(script),
    );

    if (!source.length) {
        return null;
    }

    try {
        return new RegExp(source.map((script) => String.raw`\p{Script=${script}}`).join('|'), 'u');
    } catch {
        // Script codes unknown to the regexp engine disable the check.
        return null;
    }
}

/**
 * Returns a regexp matching words written in the scripts of the other
 * language of a pair that the given language does not use itself: Latin
 * identifiers and product names inside Cyrillic text, Cyrillic names
 * inside Latin text. Such words are copied, not translated, so a
 * translation carries the same ones as its source. Returns null when the
 * two languages share their scripts.
 */
export function foreignWordPattern(language: string, other: string): RegExp | null {
    const own = new Set(scriptsOf(language));
    const foreign = scriptsOf(other).filter((script) => !own.has(script));

    if (!foreign.length) {
        return null;
    }

    try {
        const letters = foreign.map((script) => String.raw`\p{Script=${script}}`).join('|');

        return new RegExp(String.raw`(?:${letters})(?:${letters}|\p{Nd}|_)*`, 'gu');
    } catch {
        // Script codes unknown to the regexp engine disable the check.
        return null;
    }
}
