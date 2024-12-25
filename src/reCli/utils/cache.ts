import crypto from 'node:crypto';

export function getHash(data: unknown, len?: number) {
    const cHash = crypto.createHash('sha256');
    const hash = cHash.update(JSON.stringify({_: data})).digest('hex');
    return len ? hash.slice(0, len) : hash;
}
