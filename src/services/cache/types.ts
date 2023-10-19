export interface HashKey {
    filename: string;
    contentHash: string;
    varsHashList: string[];
    key: string;
}

export type CacheFileDataWithDeps = CacheFileData & Deps;
type TargetLocation = string;
type SourceLocation = string;

export interface CacheFileData extends HashKey {
    result?: unknown;
}

export interface Deps {
    fileDeps: Record<SourceLocation, string>;
    wroteFiles: Record<TargetLocation, string>;
    copiedFiles: Record<TargetLocation, SourceLocation>;
    existsFiles: Record<SourceLocation, boolean>;
    fileVarsDeps: Record<SourceLocation, string[]>;
}
