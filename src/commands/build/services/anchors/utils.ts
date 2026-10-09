/** Detects an explicit version selector whose anchors may differ from this build. */
export function isVersionedQuery(search: string | null): boolean {
    return Boolean(search && new URLSearchParams(search).get('version'));
}
