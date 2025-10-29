import type MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline';
import type Token from 'markdown-it/lib/token';

import StateBlock from 'markdown-it/lib/rules_block/state_block';

type ExtendedToken = Token & {
    pos: [number, number];
    blkIndent: number;
};

class EStateBlock extends StateBlock {
    push(...args) {
        const token = super.push(...args);
        (token as ExtendedToken).blkIndent = this.blkIndent;

        return token;
    }
}

export default ((md: MarkdownIt) => {
    function wrap(name: string, wrap) {
        const index = this.__find__(name);

        if (index === -1) { throw new Error('Parser rule not found: ' + name); }

        this.__rules__[index].fn = wrap(this.__rules__[index].fn);
    }

    md.block.State = EStateBlock;
    md.block.ruler.wrap = wrap;
    md.inline.ruler.wrap = wrap;

    md.block.ruler.wrap('fence', function(_fence) {
        return function(...args) {
            const ok = _fence.call(this, ...args);
            if (ok) {
                const [state, line] = args;
                const token = state.tokens[state.tokens.length - 1];

                token.pos = [
                    state.bMarks[line] + state.tShift[line],
                    state.eMarks[state.line],
                ];
            }

            return ok;
        }
    });

    md.inline.ruler.wrap('image', function(_image) {
        return function(this: MarkdownIt, ...args: [StateInline]) {
            const [state] = args;
            const start = state.pos;
            const ok = _image.call(this, ...args);
            if (ok) {
                const image = state.tokens[findLastIndex(state.tokens, 'image')];

                image.pos = [start, state.pos];
            }

            return ok;
        }
    });

    md.inline.ruler.wrap('link', function(_link) {
        return function(this: MarkdownIt, ...args: [StateInline]) {
            const [state] = args;
            const start = state.pos;
            const ok = _link.call(this, ...args);
            if (ok) {
                const open = state.tokens[findLastIndex(state.tokens, 'link_open')];
                const close = state.tokens[findLastIndex(state.tokens, 'link_close')];
                open.pos = [start, state.pos];
                close.pos = [start, state.pos];
            }

            return ok;
        }
    });

    md.block.ruler.wrap('table', function(_table) {
        return function(this: MarkdownIt, ...args: [StateBlock]) {
            const [state] = args;
            const ok = _table.call(this, ...args);
            if (ok) {
                const open = findLastIndex(state.tokens, 'table_open');
                const close = findLastIndex(state.tokens, 'table_close');

                remapTable(state, state.tokens.slice(open, close));
            }

            return ok;
        }
    });

    md.block.ruler.wrap('heading', function(_heading) {
        return function(this: MarkdownIt, ...args: [StateBlock]) {
            const [state] = args;
            const ok = _heading.call(this, ...args);
            if (ok) {
                const heading = state.tokens[state.tokens.length - 3];
                const inline = state.tokens[state.tokens.length - 2];
                const pos = [
                    state.bMarks[inline.map[0]] + state.tShift[inline.map[0]] + heading.markup.length,
                    state.eMarks[inline.map[1]],
                ];

                const content = state.src.slice(pos[0], pos[1]);
                const bDiff = content.length - content.trimStart().length;
                const eDiff = content.length - content.trimEnd().length;

                (inline as ExtendedToken).pos = [pos[0] + bDiff, pos[1] - eDiff];
            }

            return ok;
        }
    });

    md.core.ruler.push('sourcemap', function(state) {
        const block = new StateBlock(state.src, state.md, state.env, state.tokens);

        remapChildren(block, state.tokens, 0);
    });

    md.core.ruler.push('sourcemap', function(state) {
        showImage(state, state.tokens);
    });
});

function findLastIndex(tokens: Token[], type: string) {
    for (let i = tokens.length - 1; i >= 0; i--) {
        if (tokens[i].type === type) {
            return i;
        }
    }

    return -1;
}

function remapTable(state: StateBlock, table: Token[]) {
    let start = 0, end = state.eMarks[state.line];
    let tdOffset = 0;

    for(let i = 0; i < table.length; i++) {
        const token = table[i];

        if (token.type === 'tr_open') {
            start = state.bMarks[token.map[0]] + state.tShift[token.map[0]];
            end = state.bMarks[token.map[1]] - 1;
            tdOffset = state.src[start] === '|' ? 1 : 0;
        }

        if (token.type === 'td_open' || token.type === 'th_open') {
            const inline = table[i + 1];
            const nextOffset = state.src.indexOf('|', start + tdOffset) - start;
            const pos = [
                start + tdOffset,
                (nextOffset > -1 && (nextOffset + start) < end ? start + nextOffset : end),
            ];

            const content = state.src.slice(pos[0], pos[1]);
            const bDiff = content.length - content.trimStart().length;
            const eDiff = content.length - content.trimEnd().length;

            (inline as ExtendedToken).pos = [pos[0] + bDiff, pos[1] - eDiff];

            tdOffset = nextOffset;
        }

        if (token.type === 'td_close' || token.type === 'th_close') {
            tdOffset += 1;
        }
    }
}

function remapChildren(state: StateBlock, tokens: Token[], offset = 0, indent = 0, breaks: number[] = []) {
    for (const token of tokens) {
        const {pos, map, blkIndent} = (token as ExtendedToken);

        if (pos) {
            shift(pos, offset + (indent * getBreaksCount(breaks, pos[0])));
        }

        if (token.children && (pos || map)) {
            const offset = pos
                ? pos[0]
                : state.bMarks[map[0]] + (blkIndent || state.tShift[map[0]]);

            const breaks: number[] = blkIndent ? findBreaks(token.content) : [];

            remapChildren(state, token.children, offset, blkIndent || 0, breaks);
        }
    }
}

function shift(map: [number, number], offset: number) {
    map[0] += offset;
    map[1] += offset;
}

function findBreaks(content: string) {
    const _break = /\n/g;
    const breaks = [];
    while (_break.exec(content)) {
        breaks.push(_break.lastIndex);
    }
    return breaks;
}

function getBreaksCount(breaks: number[], pos: number) {
    let i = 0;
    while (pos <= breaks[i]) {i++}
    return i;
}

function showImage(state: StateCore, tokens: Token[]) {
    for (const token of tokens) {
        if (token.type === 'image') {
            console.log('{' + state.src.slice(token.pos[0], token.pos[1]) + '}');
        }

        if (token.children) {
            showImage(state, token.children);
        }
    }
}
