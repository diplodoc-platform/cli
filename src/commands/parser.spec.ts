import {describe, expect, it} from 'vitest';

import {parse} from './parser';

describe('early command arguments', () => {
    it.each([
        ['--vcs', true],
        ['--no-vcs', false],
    ])('parses %s before extension discovery', (flag, vcs) => {
        expect(parse(['node', 'docs', 'build', '--internal-build', flag])).toMatchObject({
            internalBuild: true,
            vcs,
        });
    });

    it('does not override VCS configuration when the flag is absent', () => {
        expect(parse(['node', 'docs', '--internal-build'])).not.toHaveProperty('vcs');
    });
});
