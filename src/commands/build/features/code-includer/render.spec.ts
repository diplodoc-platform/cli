import {describe, expect, it} from 'vitest';

import {renderCodeFence} from './render';

describe('renderCodeFence', () => {
    it('uses a fence longer than backtick runs in the source', () => {
        expect(renderCodeFence('const example = ````nested````;', 'ts')).toBe(
            '`````ts\nconst example = ````nested````;\n`````',
        );
    });
});
