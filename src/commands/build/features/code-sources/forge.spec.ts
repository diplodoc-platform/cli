import {describe, expect, it} from 'vitest';

import {forgeOf, refsUrl} from './forge';

describe('forgeOf', () => {
    it('should serve github from the raw content host', () => {
        expect(forgeOf('https://github.com').raw).toBe(
            'https://raw.githubusercontent.com/{repo}/{commit}/{path}',
        );
    });

    it('should ignore a www prefix on github', () => {
        expect(forgeOf('https://www.github.com').raw).toContain('raw.githubusercontent.com');
    });

    it('should serve github enterprise from its own host', () => {
        expect(forgeOf('https://github.example.com').raw).toBe('{host}/{repo}/raw/{commit}/{path}');
    });

    it('should use the gitlab url shape', () => {
        const forge = forgeOf('https://gitlab.com');

        expect(forge.raw).toBe('{host}/{repo}/-/raw/{commit}/{path}');
        expect(forge.link).toBe('{host}/{repo}/-/blob/{commit}/{path}#{lines}');
    });

    it('should use the bitbucket url shape', () => {
        const forge = forgeOf('https://bitbucket.org');

        expect(forge.raw).toBe('{host}/{repo}/raw/{commit}/{path}');
        expect(forge.link).toContain('/src/{commit}/');
    });

    it('should assume the github shape for an unknown host', () => {
        // There is no clone to fall back to, so an unrecognised host still has to
        // produce something usable; `raw`/`link` override it when wrong.
        expect(forgeOf('https://git.internal.example.com').raw).toBe(
            '{host}/{repo}/raw/{commit}/{path}',
        );
    });

    it('should pin downloads to a commit rather than a ref', () => {
        for (const host of ['https://github.com', 'https://gitlab.com', 'https://x.internal']) {
            expect(forgeOf(host).raw).not.toContain('{ref}');
        }
    });
});

describe('refsUrl', () => {
    it('should point at the ref advertisement endpoint', () => {
        expect(refsUrl('https://github.com', 'org/repo')).toBe(
            'https://github.com/org/repo/info/refs?service=git-upload-pack',
        );
    });
});
