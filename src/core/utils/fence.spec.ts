import {describe, expect, it} from 'vitest';

import {fenceCloseTail, isFenceClose, matchFenceOpen} from './fence';

describe('fence utils', () => {
    describe('matchFenceOpen', () => {
        it('should match a backtick fence', () => {
            expect(matchFenceOpen('```')).toEqual({markup: '```', info: ''});
        });

        it('should match a tilde fence', () => {
            expect(matchFenceOpen('~~~')).toEqual({markup: '~~~', info: ''});
        });

        it('should match runs longer than three characters', () => {
            expect(matchFenceOpen('`````')).toEqual({markup: '`````', info: ''});
            expect(matchFenceOpen('~~~~')).toEqual({markup: '~~~~', info: ''});
        });

        it('should keep the info string', () => {
            expect(matchFenceOpen('```js title="a.js"')).toEqual({
                markup: '```',
                info: 'js title="a.js"',
            });
        });

        it('should reject runs shorter than three characters', () => {
            expect(matchFenceOpen('``')).toBeNull();
            expect(matchFenceOpen('~~')).toBeNull();
        });

        it('should reject a backtick fence with backticks in the info string', () => {
            expect(matchFenceOpen('```foo`bar')).toBeNull();
        });

        it('should allow backticks in the info string of a tilde fence', () => {
            expect(matchFenceOpen('~~~foo`bar')).toEqual({markup: '~~~', info: 'foo`bar'});
        });

        it('should open a tilde fence that wraps a backtick fence', () => {
            // The whole point of the tilde flavour: showing a ``` block as
            // an example. Only the run decides, the backticks below are
            // content, and a backtick line never closes a tilde fence.
            expect(matchFenceOpen('~~~')).toEqual({markup: '~~~', info: ''});
            expect(matchFenceOpen('```js')).toEqual({markup: '```', info: 'js'});
            expect(isFenceClose('```', '~~~')).toBe(false);
            expect(isFenceClose('~~~', '~~~')).toBe(true);
        });

        it('should not match an indented fence', () => {
            expect(matchFenceOpen('  ```')).toBeNull();
        });

        it('should not match a line without a fence', () => {
            expect(matchFenceOpen('text')).toBeNull();
        });
    });

    describe('isFenceClose', () => {
        it('should close a fence of the same length', () => {
            expect(isFenceClose('```', '```')).toBe(true);
        });

        it('should close a fence with a longer run', () => {
            expect(isFenceClose('`````', '```')).toBe(true);
        });

        it('should not close a fence with a shorter run', () => {
            expect(isFenceClose('```', '````')).toBe(false);
        });

        it('should not close a fence of another character', () => {
            expect(isFenceClose('~~~', '```')).toBe(false);
        });

        it('should allow trailing whitespace', () => {
            expect(isFenceClose('```  \t', '```')).toBe(true);
        });

        it('should not allow trailing content', () => {
            expect(isFenceClose('``` ||', '```')).toBe(false);
        });
    });

    describe('fenceCloseTail', () => {
        it('should return an empty tail for a plain closer', () => {
            expect(fenceCloseTail('```', '```')).toBe('');
        });

        it('should return the trimmed tail', () => {
            expect(fenceCloseTail('``` ||', '```')).toBe('||');
        });

        it('should return null for a non-closer', () => {
            expect(fenceCloseTail('~~~', '```')).toBeNull();
            expect(fenceCloseTail('text', '```')).toBeNull();
        });
    });
});
