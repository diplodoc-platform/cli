# Manual dependency verification pilot — do not merge or publish

CLI baseline: `002038417db8308bbacbf088c9c456a38130aa0e` (5.64.0).
Transform source: `cfd828dc7a491cc7e0e847a41ce9c615b27cc95b` (4.78.9),
including the merged Dependabot update #1064.

The archive is built with transform's own locked install. Runtime source is
unchanged. Pilot-only additions are a dependency proof module/declaration and
source/build identity metadata; the archive's `js-yaml` dependency is pinned to
4.3.2 so a later workspace install cannot silently substitute another version.
CLI's own direct YAML dependency is unchanged; the proof checks YAML from the
transform module's resolution context.

`tests/e2e/dependency-pilot.spec.ts` runs the executable selected through the
existing `DIPLODOC_BINARY_PATH` fixture. In an internal run that is the packaged
CLI binary, not a source-side Node process. It requires the expected transform
source SHA, package version, runtime-tree digest and actual YAML version, performs
a YAML parsing smoke check, and prints `DEPENDENCY_PILOT_PROOF` to the test log.
The probe fails if a registry transform without the pilot module is substituted.

`archive.json` records the archive SHA256/SRI and original compiled `lib/` tree
identity. `proof.cjs` exposes the diagnostic module's code for review (the archive
copy has equivalent code with different comment/import formatting). The tree digest is provenance
recorded when packing, not a claim that the executable re-hashes its bytecode.
The executable does resolve and execute the archive's probe and YAML module.

This branch changes no schedules, infrastructure distribution or merge policy.
Do not update snapshots to make the pilot pass. Do not merge this diagnostic PR;
close it after evidence is collected. No stable npm publication is needed.
