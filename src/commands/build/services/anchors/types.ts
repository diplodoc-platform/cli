export type AnchorIndex = ReadonlyMap<NormalizedPath, ReadonlySet<string>>;

export type ResolveAnchorPage = (path: NormalizedPath) => NormalizedPath | null;
