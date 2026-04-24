import assets from '@diplodoc/cli/manifest';

export function platformless(text: string): string {
    let index = 1;

    return (
        hashless(text)
            .replace(/\r\n/g, '\n')
            // Fix for XML equiv-text attributes in Windows - handle various patterns
            .replace(/equiv-text="[\r\n]+&#10;"/g, 'equiv-text="&#10;"')
            .replace(/equiv-text="[\r\n]+&amp;#10;"/g, 'equiv-text="&amp;#10;"')
            // Also normalize any other attributes that might have line ending issues
            .replace(/(ctype|id)="[\r\n]+(.*?)"/g, '$1="$2"')
            .replace(/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/g, 'UUID')
            .replace(
                /(content"?[:=]{1}[" ]{1}Diplodoc.*? )v\d+\.\d+\.\d+(?:-[\w-]+)?/g,
                `$1vDIPLODOC-VERSION`,
            )
            .replace(
                /(aria-controls=\\":term_element\\" tabindex=\\"\d\\" id=\\")[a-zA-Z0-9]{1,10}/g,
                `$1vTERM-ID`,
            )
            .replace(/(\\(?![/"'])){1,2}/g, '/')
            .replace(
                /id=\\"inline-code-id-[a-zA-Z0-9]{8}\\"/g,
                () => `id="inline-code-id-${index++}"`,
            )
    );
}

export function hashless(text: string): string {
    return text
        .replace(/-[a-z0-9]{12,16}\./g, '-hash.')
        .replace(/(rnd|svg)-[a-z0-9]{3,8}__/g, 'rnd-hash__')
        .replace(/(\/|\\)[a-z0-9]{12,16}-(index|registry|resources)\./g, '/hash-$2.');
}

/**
 * Replaces hashed bundle filenames from the client manifest with stable labels
 * and sorts bundle references to normalize platform-dependent ordering.
 *
 * Examples: "app-3ff8bc0b40bc2914.js" → "app-js",
 *           "vendor-00121562c7b7d3b5.rtl.css" → "vendor-rtl-css",
 *           "976-40cbc1d2518eb8ea.js" → "chunk-js" (numeric webpack chunk ID).
 */
export function bundleless(text: string): string {
    // On Windows the CLI may emit `_bundle\file` or JSON-escaped `_bundle\\/file`.
    // Collapse any mix of backslashes and forward slashes after `_bundle` into `/`.
    text = text.replace(/_bundle[/\\]+/g, '_bundle/');

    for (const entry of Object.values(assets)) {
        for (const files of Object.values(entry)) {
            for (const filename of files) {
                const match = filename.match(
                    /^([a-z0-9]+)-[a-f0-9]{12,16}((?:\.[a-z]+)*)\.([a-z]+)$/,
                );
                if (!match) continue;

                const [, rawBase, suffixes, ext] = match;
                const base = /^\d+$/.test(rawBase) ? 'chunk' : rawBase;
                const suffixPart = suffixes.replace(/\./g, '-').slice(1); // ".rtl" → "rtl"
                const label = suffixPart ? `${base}-${suffixPart}-${ext}` : `${base}-${ext}`;
                const escapedSuffixes = suffixes.replace(/\./g, '\\.');
                const pattern = new RegExp(
                    `${rawBase}-[a-f0-9]{12,16}${escapedSuffixes}\\.${ext}`,
                    'g',
                );
                text = text.replace(pattern, label);
            }
        }
    }

    return sortBundleTokens(text);
}

/**
 * Sorts contiguous runs of `_bundle/` references so snapshots stay stable
 * regardless of manifest ordering or platform.
 *
 * Pass 1 (line-level): sorts groups of consecutive lines containing `_bundle/`
 * — handles HTML `<link>` / `<script>` tags on separate lines.
 *
 * Pass 2 (inline): sorts groups of `_bundle/` tokens on the same line separated
 * only by punctuation — handles JSON arrays like `"cssLink":["_bundle/b","_bundle/a"]`.
 */
function sortBundleTokens(text: string): string {
    const bundleRe = /_bundle\/[a-z0-9][-a-z0-9]*/;

    // --- Pass 1: line-level sort ---
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length) {
        if (!bundleRe.test(lines[i])) {
            i++;
            continue;
        }
        const start = i;
        while (i < lines.length && bundleRe.test(lines[i])) {
            i++;
        }
        if (i - start < 2) continue;

        const slice = lines.slice(start, i);
        const sorted = [...slice].sort((a, b) => {
            const ka = a.match(bundleRe)?.[0] ?? '';
            const kb = b.match(bundleRe)?.[0] ?? '';
            return ka < kb ? -1 : ka > kb ? 1 : 0;
        });
        for (let j = 0; j < sorted.length; j++) {
            lines[start + j] = sorted[j];
        }
    }
    text = lines.join('\n');

    // --- Pass 2: inline sort (JSON arrays, etc.) ---
    const tokenRe = /_bundle\/[a-z0-9][-a-z0-9]*/g;
    const hits: {start: number; end: number; value: string}[] = [];
    let m;
    while ((m = tokenRe.exec(text)) !== null) {
        hits.push({start: m.index, end: m.index + m[0].length, value: m[0]});
    }
    if (hits.length < 2) return text;

    // Gap between two tokens is "glue" when it contains no alphanumeric chars
    // (ignoring `_bundle` substrings that may appear in the gap).
    const isGlue = (gap: string) => !/[a-zA-Z0-9]/.test(gap.replace(/_bundle/g, ''));

    // Group consecutive same-line tokens into runs.
    const runs: number[][] = [[0]];
    for (let idx = 1; idx < hits.length; idx++) {
        const gap = text.slice(hits[idx - 1].end, hits[idx].start);
        if (!gap.includes('\n') && isGlue(gap)) {
            runs[runs.length - 1].push(idx);
        } else {
            runs.push([idx]);
        }
    }

    // Sort each run with 2+ tokens, rewriting from the end to preserve offsets.
    for (let r = runs.length - 1; r >= 0; r--) {
        const run = runs[r];
        if (run.length < 2) continue;

        const values = run.map((idx) => hits[idx].value);
        const sorted = [...values].sort();
        if (values.every((v, idx) => v === sorted[idx])) continue;

        for (let k = run.length - 1; k >= 0; k--) {
            const {start: s, end: e} = hits[run[k]];
            text = text.slice(0, s) + sorted[k] + text.slice(e);
        }
    }

    return text;
}
