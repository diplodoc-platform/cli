import type {LoaderContext} from '../loader';

export function resolveBlockCodes(this: LoaderContext, content: string) {
    const CODE_CONTENTS =
        /(?:(?:^|\n)[ \t]*(?:`{3,}|~{3,})[\s\S]*?(?:`{3,}|~{3,})(?:\n|$))|(?:`[^`\n]+?`)|(?:^(?: {4}|\t).*$(?:\n^(?: {4}|\t).*$)*)/gm;
    const NO_CODE_CONTENTS =
        /(^\s*[^:\n]+\n:\s+[^\n]+(?:\n(?!\s*[^:\n]+\n:|^\s*\d+\.|^#|^<!--|^- |^\s*```).*)*$)/gm;

    const allCodes: Array<[number, number]> = [];
    const noCodes: Array<[number, number]> = [];

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = CODE_CONTENTS.exec(content))) {
        allCodes.push([match.index, CODE_CONTENTS.lastIndex] as [number, number]);
    }
    // eslint-disable-next-line no-cond-assign
    while ((match = NO_CODE_CONTENTS.exec(content))) {
        noCodes.push([match.index, NO_CODE_CONTENTS.lastIndex] as [number, number]);
    }

    const codes = allCodes.filter(([start, end]) => {
        return !noCodes.some(([noStart, noEnd]) => start >= noStart && end <= noEnd);
    });
    this.api.blockCodes.set(codes);

    return content;
}
