import {describe, expect, it} from 'vitest';

import {parseRefs, selectRef} from './refs';

/** Builds a pkt-line stream the way a git server advertises refs. */
function advertise(lines: string[]) {
    const body = lines
        .map((line) => {
            if (line === '') {
                return '0000';
            }

            const payload = `${line}\n`;
            const length = (payload.length + 4).toString(16).padStart(4, '0');

            return length + payload;
        })
        .join('');

    return new TextEncoder().encode(body);
}

const SHA = '53b1b16801430b798ff0b2f194b3876cc8394908';
const TAG = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PEELED = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('parseRefs', () => {
    it('should read refs out of a pkt-line advertisement', () => {
        const bytes = advertise([
            '# service=git-upload-pack',
            '',
            `${SHA} HEAD\0multi_ack symref=HEAD:refs/heads/main agent=git/2.0`,
            `${SHA} refs/heads/main`,
            `${TAG} refs/tags/v1.0`,
            '',
        ]);

        expect(parseRefs(bytes)).toEqual({
            HEAD: SHA,
            'refs/heads/main': SHA,
            'refs/tags/v1.0': TAG,
        });
    });

    it('should ignore the service header and flush packets', () => {
        const refs = parseRefs(advertise(['# service=git-upload-pack', '', '']));

        expect(refs).toEqual({});
    });

    it('should stop at a truncated stream rather than throw', () => {
        const bytes = new TextEncoder().encode(`0048${SHA} refs/heads/ma`);

        expect(() => parseRefs(bytes)).not.toThrow();
    });

    it('should tolerate garbage instead of a length header', () => {
        expect(parseRefs(new TextEncoder().encode('<html>nope'))).toEqual({});
    });
});

describe('selectRef', () => {
    const refs = {
        HEAD: SHA,
        'refs/heads/main': SHA,
        'refs/tags/v1.0': TAG,
        'refs/tags/v1.0^{}': PEELED,
    };

    it('should resolve a branch', () => {
        expect(selectRef(refs, 'main')).toBe(SHA);
    });

    it('should resolve an annotated tag to the commit it points at', () => {
        // `refs/tags/v1.0` is the tag object; only the peeled form addresses content.
        expect(selectRef(refs, 'v1.0')).toBe(PEELED);
    });

    it('should resolve a lightweight tag', () => {
        expect(selectRef({'refs/tags/v2.0': TAG}, 'v2.0')).toBe(TAG);
    });

    it('should resolve a fully qualified ref', () => {
        expect(selectRef(refs, 'refs/heads/main')).toBe(SHA);
    });

    it('should resolve HEAD', () => {
        expect(selectRef(refs, 'HEAD')).toBe(SHA);
    });

    it('should return null for an unknown ref', () => {
        expect(selectRef(refs, 'nope')).toBe(null);
    });
});
