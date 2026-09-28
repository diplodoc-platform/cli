export type UpdateEntry =
    | {
          kind: 'update';
          sourcePath: string;
          targetPath: string;
          sourceBeforePath: string;
          sourceAfterPath: string;
          targetBeforePath: string;
      }
    | {kind: 'create'; sourcePath: string; targetPath: string; sourceAfterPath: string};
export type Snapshot = {
    inputRoot?: string;
    entry: UpdateEntry;
    sourceBefore: string | null;
    sourceAfter: string;
    targetBefore: string | null;
};
export type UpdateDiagnostic = {
    code:
        | 'source_conflict'
        | 'target_alignment_conflict'
        | 'missing_target'
        | 'unsupported_structure'
        | 'invalid_output'
        | 'untranslated_units';
    message: string;
};
