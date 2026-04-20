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
        .replace(/rnd-[a-z0-9]{1,8}__/g, 'rnd-hash__')
        .replace(/(\/|\\)[a-z0-9]{12,16}-(index|registry|resources)\./g, '/hash-$2.');
}

export function bundleless(text: string): string {
    for (const [entryKey, entry] of Object.entries(assets)) {
        for (const [typeKey, type] of Object.entries(entry)) {
            for (let index = 0; index < type.length; index++) {
                // Match filenames with hash pattern:
                // - "app-3ff8bc0b40bc2914.js"          -> base="app", ext="js"
                // - "vendor-00121562c7b7d3b5.rtl.css"   -> base="vendor", suffixes=".rtl", ext="css"
                // - "976-40cbc1d2518eb8ea.js"           -> base="976", ext="js"
                // Pattern: <base>-<12-16 hex chars>[.<suffix>...].<ext>
                const filename = type[index];
                const match = filename.match(
                    /^([a-z0-9]+)-[a-f0-9]{12,16}((?:\.[a-z]+)*)\.([a-z]+)$/,
                );
                if (!match) {
                    // Fallback: exact string replacement for filenames without hash pattern
                    let prev = '';
                    while (prev !== text) {
                        prev = text;
                        text = text.replace(filename, `${entryKey}-${typeKey}-${index}`);
                    }
                    continue;
                }

                // Use base name as stable identifier (not index) so that
                // different versions of @diplodoc/client with different manifest
                // ordering produce the same normalized names.
                // e.g. "app-<hash>.js" -> "app-js", "vendor-<hash>.rtl.css" -> "vendor-rtl-css"
                const [, base, suffixes, ext] = match;
                const suffixPattern = suffixes ? suffixes.replace(/\./g, '\\.') : '';
                const pattern = new RegExp(`${base}-[a-f0-9]{12,16}${suffixPattern}\\.${ext}`, 'g');
                const suffixLabel = suffixes ? suffixes.replace(/\./g, '-').replace(/^-/, '') : '';
                const label = suffixLabel ? `${base}-${suffixLabel}-${ext}` : `${base}-${ext}`;
                text = text.replace(pattern, label);
            }
        }
    }

    return text;
}
