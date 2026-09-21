import {SourceError} from './types';

/**
 * Resolves a ref to a commit over git's smart HTTP protocol.
 *
 * This is what `git ls-remote` does under the hood, and doing it directly means
 * the common path needs no `git` binary at all — only a fetch. The response is a
 * pkt-line stream: four hex digits of length (inclusive of themselves), then the
 * payload; `0000` is a flush packet.
 */
function* pktLines(bytes: Uint8Array) {
    const decoder = new TextDecoder();

    let pos = 0;
    while (pos + 4 <= bytes.length) {
        const length = parseInt(decoder.decode(bytes.subarray(pos, pos + 4)), 16);

        if (Number.isNaN(length)) {
            return;
        }

        // Flush packet: a section boundary, not content.
        if (length === 0) {
            pos += 4;
            continue;
        }

        if (length < 4 || pos + length > bytes.length) {
            return;
        }

        yield decoder.decode(bytes.subarray(pos + 4, pos + length));

        pos += length;
    }
}

const SHA_LINE = /^([0-9a-f]{40})\s+(\S+)$/;

export function parseRefs(bytes: Uint8Array): Hash<string> {
    const refs: Hash<string> = {};

    for (const line of pktLines(bytes)) {
        // The first ref line carries server capabilities after a NUL.
        const match = SHA_LINE.exec(line.split('\0')[0].trim());

        if (match) {
            refs[match[2]] = match[1];
        }
    }

    return refs;
}

/**
 * Picks the commit a user-supplied ref means.
 *
 * Follows git's own disambiguation order, and prefers the peeled form of an
 * annotated tag — `refs/tags/x` is the tag object, `refs/tags/x^{}` is the commit
 * that actually addresses content.
 */
export function selectRef(refs: Hash<string>, ref: string): string | null {
    const candidates = [
        `${ref}^{}`,
        ref,
        `refs/${ref}`,
        `refs/tags/${ref}^{}`,
        `refs/tags/${ref}`,
        `refs/heads/${ref}`,
    ];

    for (const candidate of candidates) {
        if (refs[candidate]) {
            return refs[candidate];
        }
    }

    return null;
}

/**
 * Resolves a ref to a commit without downloading any content.
 *
 * The ref advertisement is a few kilobytes and needs nothing but a fetch, which
 * is what keeps this feature free of a `git` dependency.
 */
export async function resolveRef(endpoint: string, ref: string): Promise<string> {
    const response = await fetch(endpoint);

    if (!response.ok) {
        throw new SourceError(
            `GET ${endpoint} failed with ${response.status} ${response.statusText}`,
        );
    }

    const refs = parseRefs(new Uint8Array(await response.arrayBuffer()));
    const commit = selectRef(refs, ref);

    if (!commit) {
        throw new SourceError(`Ref '${ref}' not found at ${endpoint}`);
    }

    return commit;
}
