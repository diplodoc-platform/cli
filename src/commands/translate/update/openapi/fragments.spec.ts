import {describe, expect, it} from 'vitest';

import {planFragments} from './fragments';

describe('framing OpenAPI translation input', () => {
    it('translates identical fragments once and spreads results back to each source position', () => {
        const update = planFragments(['Jupiter', 'Saturn', 'Jupiter'], (values) =>
            values.join(', '),
        );
        const output = update.input.replace('Jupiter', '木星').replace('Saturn', '土星');
        expect(update.apply(output)).toBe('木星, 土星, 木星');
        expect(() => update.apply('unexpected preface\n' + output)).toThrow('Incomplete');
        expect(() => update.apply(output.replace('fragment-0', 'fragment-2'))).toThrow(
            'Unexpected',
        );
        expect(() => update.apply(output.replace('土星', ''))).toThrow('Unexpected');
        expect(() =>
            update.apply(output.replace('土星', '土星 <!-- translation-fragment-extra')),
        ).toThrow('Unexpected');
    });

    it('requires the exact output shape for zero and one fragments', () => {
        const empty = planFragments([], (values) => String(values.length));
        expect(empty.apply(' \n')).toBe('0');
        expect(() => empty.apply('unrequested translation')).toThrow('structural change');
        const single = planFragments(['Moon'], ([value]) => value);
        expect(single.input).toBe('Moon');
        expect(single.apply(' 月 \n')).toBe('月');
        expect(() => single.apply('')).toThrow('Missing');
        expect(() => single.apply('<!-- translation-fragment-0 -->\nMoon')).toThrow('ambiguous');
    });

    it.each([' ', 'A <!-- translation-fragment-0 -->'])('rejects ambiguous input %j', (input) => {
        expect(() => planFragments([input], () => '')).toThrow('Empty or ambiguous');
    });
});
