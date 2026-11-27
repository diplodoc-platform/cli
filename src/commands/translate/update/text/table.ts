import type {TextPlan} from './types';

import {TranslateError} from '../../utils/errors';

// Append ordinary rows only when stable, untranslated row keys identify the same
// table in both languages. Old rows and surrounding Markdown stay byte-for-byte intact.
type Table = {text: string; end: number; scope: string};
const keyPattern = /^(?::no-translate\[[^[\]\n|]+\]|`[^`\n|]+`)$/;
const codePattern = /`[^`\n]+`/g;
const endpointLink = /^\[(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+[^\s[\]]+\]\([^\s()]+\)$/;

function conflict(reason: string): never {
    throw new TranslateError(
        'Cannot project changed Markdown table: ' + reason,
        'markdown_alignment_conflict',
    );
}

function rows(table: string) {
    const body = table.replace(/\r\n/g, '\n').slice(3, -3);
    const raw = body.split(/(?<=\|\|)\n+(?=\|\|)/);
    if (
        !raw.every(
            (row) =>
                row.startsWith('||') &&
                row.endsWith('||') &&
                !/[\\]\||\|\||#\||\|#/.test(row.slice(2, -2)),
        )
    ) {
        return undefined;
    }
    const cells = raw.map((row) =>
        row
            .slice(2, -2)
            .split('|')
            .map((s) => s.trim()),
    );
    const width = cells[0].length;
    if (
        width < 2 ||
        !cells.every(
            (row) =>
                row.length === width && row.every((cell) => cell && !/^(?:\^|>|::\{)/.test(cell)),
        )
    ) {
        return undefined;
    }
    const keys = cells.slice(1).map((row) => row[0]);
    if (
        !keys.length ||
        !keys.every((key) => keyPattern.test(key)) ||
        new Set(keys).size !== keys.length
    ) {
        return undefined;
    }
    return {width, keys};
}

function plainCell(text: string) {
    const prose = text.replace(codePattern, '');
    return (
        Boolean(text.trim()) &&
        !/^(?:\^|>)$/.test(text.trim()) &&
        !/[\r\n|]/.test(text) &&
        !/[`[\]{}<>*~\\]|^\s*(?:#|[-+] |\d+[.)] )/.test(prose)
    );
}

/** Append rows only after finding their unique, unchanged predecessor in the target. */
export function planTableAppend(
    before: string,
    after: string,
    target: string,
    tablesIn: (document: string) => Table[],
): TextPlan | undefined {
    const delta = after.length - before.length;
    if (delta <= 0 || !before.includes('#|')) {
        return undefined;
    }
    const sourceTables = tablesIn(before);
    for (const table of sourceTables) {
        const eol = table.text.endsWith('\r\n|#') ? '\r\n' : '\n';
        const at = table.end - 2 - eol.length;
        if (!after.startsWith(before.slice(0, at)) || !after.endsWith(before.slice(at))) {
            continue;
        }
        const sourceRows = rows(table.text);
        if (!sourceRows) {
            continue;
        }
        const {keys, width} = sourceRows;
        const added = after.slice(at, at + delta).replace(/\r\n/g, '\n');
        if (!/^\n+\|\|/.test(added) || !added.endsWith('||')) {
            continue;
        }
        const next = rows(table.text.slice(0, table.text.length - eol.length - 2) + added + '\n|#');
        if (!next || next.keys.length <= keys.length) {
            continue;
        }
        // Store the exact span of each prose cell. The rest of the row can be
        // copied as-is, including line breaks, endpoint links and protected IDs.
        const cells: {start: number; source: string}[] = [];
        for (const row of added.matchAll(/^\|\|([\s\S]*?)\|\|$/gm)) {
            let offset = row.index + 2;
            for (const raw of row[1].split('|')) {
                const source = raw.trim();
                if (
                    !keyPattern.test(source) &&
                    !source.split('\n').every((line) => endpointLink.test(line.trim()))
                ) {
                    if (!plainCell(source)) {
                        conflict('unsupported cell content');
                    }
                    cells.push({start: offset + raw.indexOf(source), source});
                }
                offset += raw.length + 1;
            }
        }
        const input = cells
            .map(({source}, i) => '<!-- diplodoc-update-cell-' + i + ' -->\n\n' + source)
            .join('\n\n');
        const targetOffset = () => {
            const anchor = keys[keys.length - 1];
            const candidates = tablesIn(target).filter(
                (t) => t.scope === table.scope && t.text.includes(anchor),
            );
            if (
                candidates.length !== 1 ||
                sourceTables.filter((t) => t.text.includes(anchor)).length !== 1
            ) {
                conflict('ambiguous table anchor');
            }
            const t = candidates[0],
                parsed = rows(t.text);
            if (
                !parsed ||
                parsed.width !== width ||
                JSON.stringify(parsed.keys) !== JSON.stringify(keys)
            ) {
                conflict('target rows differ');
            }
            return t.end - (t.text.endsWith('\r\n|#') ? 4 : 3);
        };
        const offset = targetOffset();
        return {
            input,
            apply(output: string) {
                const parts = output
                    .replace(/\r\n/g, '\n')
                    .split(/^<!-- diplodoc-update-cell-(\d+) -->[ \t]*$/m);
                let insertion = added;
                if (cells.length) {
                    if (parts.shift()?.trim() || parts.length !== 2 * cells.length) {
                        conflict('incomplete cell output');
                    }
                    for (let i = cells.length - 1; i >= 0; i--) {
                        const {start, source} = cells[i],
                            value = parts[i * 2 + 1].trim();
                        if (
                            parts[i * 2] !== String(i) ||
                            !plainCell(value) ||
                            JSON.stringify(value.match(codePattern)) !==
                                JSON.stringify(source.match(codePattern))
                        ) {
                            conflict('translated cell changed structure');
                        }
                        insertion =
                            insertion.slice(0, start) +
                            value +
                            insertion.slice(start + source.length);
                    }
                } else if (output) {
                    conflict('unexpected translation for a structural update');
                }
                const targetEol = target.startsWith('\r\n', offset) ? '\r\n' : '\n';
                return (
                    target.slice(0, offset) +
                    insertion.replace(/\n/g, targetEol) +
                    target.slice(offset)
                );
            },
        };
    }
    return undefined;
}
