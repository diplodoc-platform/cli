import MarkdownIt from 'markdown-it';

const CODE_CONTEXT = 'data-yfm-context="code"';
const parser = new MarkdownIt({html: true});

/** Find generated unit markers in code blocks, excluding literal marker text. */
export function codeUnitIds(source: string, skeleton: string): Set<number> {
    const ids = new Set<number>();
    const code = (text: string) =>
        parser
            .parse(text, {})
            .filter((token) => token.type === 'fence' || token.type === 'code_block');
    const original = code(source);
    for (const [index, token] of code(skeleton).entries()) {
        const before = original[index];
        if (!before || before.type !== token.type) continue;
        const literal = new Map<number, number>();
        for (const match of before.content.matchAll(/%%%(\d+)%%%/g)) {
            const id = Number(match[1]);
            literal.set(id, (literal.get(id) || 0) + 1);
        }
        const seen = new Map<number, number>();
        for (const match of token.content.matchAll(/%%%(\d+)%%%/g)) {
            const id = Number(match[1]);
            const count = (seen.get(id) || 0) + 1;
            seen.set(id, count);
            if (count > (literal.get(id) || 0)) ids.add(id);
        }
    }
    return ids;
}

/** Keep source context in the cache key, never in the model-facing text. */
export function markCodeUnit(unit: string): string {
    return unit.replace(/^<source\b/, `<source ${CODE_CONTEXT}`);
}

export function isCodeUnit(unit: string): boolean {
    return unit.slice(0, unit.indexOf('>')).includes(CODE_CONTEXT);
}
