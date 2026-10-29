/** Detects an explicit version selector whose anchors may differ from this build. */
export function isVersionedQuery(search: string | null): boolean {
    return Boolean(search && new URLSearchParams(search).get('version'));
}

/** Browser fragment directives are not HTML IDs; inspect them before percent-decoding. */
export function hasFragmentDirective(hash: string | null): boolean {
    return Boolean(hash?.includes(':~:'));
}
