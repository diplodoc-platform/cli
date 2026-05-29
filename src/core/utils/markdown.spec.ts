import {describe, expect, it} from 'vitest';
import Token from 'markdown-it/lib/token';

import {filterTokens} from './markdown';

function mkToken(type: string, payload: Record<string, string> = {}): Token {
    const t = new Token(type, '', 0);
    for (const [k, v] of Object.entries(payload)) {
        t.attrSet(k, v);
    }
    return t;
}

describe('filterTokens', () => {
    it('visits every matching token when handler does not splice', () => {
        const tokens = [
            mkToken('paragraph_open'),
            mkToken('include', {path: 'a'}),
            mkToken('paragraph_close'),
            mkToken('include', {path: 'b'}),
        ];
        const visited: string[] = [];
        filterTokens(tokens, 'include', (t) => {
            visited.push(t.attrGet('path') as string);
        });
        expect(visited).toEqual(['a', 'b']);
    });

    it('skips replacement tokens when handler returns skip > 0', () => {
        const tokens = [mkToken('include', {path: 'a'}), mkToken('include', {path: 'b'})];
        const visited: string[] = [];
        filterTokens(tokens, 'include', (token, {index}) => {
            const path = token.attrGet('path') as string;
            visited.push(path);
            // Replace include `a` with one html_block (not an include),
            // so visited should still be ['a', 'b'].
            tokens.splice(index, 1, mkToken('html_block'));
            return {skip: 1};
        });
        expect(visited).toEqual(['a', 'b']);
    });

    it('keeps iterating when handler returns skip === 0 (splice removes the token)', () => {
        // Regression for Bug 31: when an include resolves to zero tokens
        // (`splice(index, 1)` removes it), the next include must still be
        // visited.  The old `if (result?.skip)` check treated 0 as falsy
        // and let the outer `index++` skip past the shifted-in token.
        const tokens = [mkToken('include', {path: 'empty'}), mkToken('include', {path: 'real'})];
        const visited: string[] = [];
        filterTokens(tokens, 'include', (token, {index}) => {
            const path = token.attrGet('path') as string;
            visited.push(path);
            tokens.splice(index, 1);
            return {skip: 0};
        });
        expect(visited).toEqual(['empty', 'real']);
        expect(tokens).toEqual([]);
    });

    it('handles a chain of zero-token splices', () => {
        const tokens = [
            mkToken('include', {path: 'a'}),
            mkToken('include', {path: 'b'}),
            mkToken('include', {path: 'c'}),
            mkToken('html_block'),
        ];
        const visited: string[] = [];
        filterTokens(tokens, 'include', (token, {index}) => {
            const path = token.attrGet('path') as string;
            visited.push(path);
            tokens.splice(index, 1);
            return {skip: 0};
        });
        expect(visited).toEqual(['a', 'b', 'c']);
        expect(tokens.map((t) => t.type)).toEqual(['html_block']);
    });

    it('mixes skip > 0 and skip === 0 replacements correctly', () => {
        const tokens = [
            mkToken('include', {path: 'empty'}),
            mkToken('include', {path: 'multi'}),
            mkToken('include', {path: 'tail'}),
        ];
        const visited: string[] = [];
        filterTokens(tokens, 'include', (token, {index}) => {
            const path = token.attrGet('path') as string;
            visited.push(path);
            if (path === 'empty') {
                tokens.splice(index, 1);
                return {skip: 0};
            }
            if (path === 'multi') {
                tokens.splice(index, 1, mkToken('html_block'), mkToken('paragraph_open'));
                return {skip: 2};
            }
            tokens.splice(index, 1, mkToken('html_block'));
            return {skip: 1};
        });
        expect(visited).toEqual(['empty', 'multi', 'tail']);
        expect(tokens.map((t) => t.type)).toEqual(['html_block', 'paragraph_open', 'html_block']);
    });
});
