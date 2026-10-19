# Manual components dependency pilot — DO NOT MERGE OR PUBLISH

CLI baseline: `002038417db8308bbacbf088c9c456a38130aa0e` (5.64.0).
Components candidate: `471b0452324f0e3963f465e3fa9a2f526cd679a5` (5.24.1), Dependabot #795.
Client baseline: `db7d41b1ab8db599c1e57ab21c17b7bdbad508a7` (5.14.8).
Build workspace: metapackage `fd01403975f244d4b9c82a735efa7b1f5119f3fe`.

The CLI consumes compiled client assets, not components source. Therefore the
active CLI dependency is the rebuilt client archive. The components archive is
also preserved here as build provenance; installing an unused components package
at the CLI root would not validate this chain.

## Payload and proof

- The same workspace lock overlay used by the successful real #795 caller pins
  components' DOMPurify to3.4.17. Direct components and isomorphic-dompurify
  resolution paths were checked to point at that same package instance.
- Original compiled components files are unchanged. Only a diagnostic export,
  its declaration and package export mapping are added to the components archive.
- Client is rebuilt from the stated source with one diagnostic SSR export. It
  calls the components probe and adds client source/version identity. Ordinary
  browser and server entrypoints remain the candidate's actual build outputs.
- The probe reads `DOMPurify.version` from the loaded library factory. It does
  not pretend a metadata string is a runtime version, or add JSDOM-only code to
  SSR. Sanitization/browser coverage belongs to the existing component/testpack
  suites; loading the factory is not an independent XSS security audit.
- The client SSR source map identifies components' private dompurify3.4.17.
  CLI's unrelated development dependency resolutions are not upgraded globally.
- `--dependency-pilot-proof` calls the export in the real client SSR module.
  `tests/e2e/dependency-pilot.spec.ts` invokes the tested executable through
  Runner, including `DIPLODOC_BINARY_PATH` inside Internal Check, and logs
  `DEPENDENCY_PILOT_PROOF`. A registry client substituted for the archive lacks
  the custom export and cannot satisfy the test.

The components probe in `package/build/dependency-pilot-proof.cjs` is:

```js
'use strict';
const assert = require('node:assert/strict');
const DOMPurify = require('dompurify');
const manifest = require('../package.json');

exports.readDependencyPilotProof = function readDependencyPilotProof() {
  assert.equal(manifest.version, '5.24.1');
  assert.equal(DOMPurify.version, '3.4.17');
  assert.equal(typeof DOMPurify, 'function');
  return {
    componentsSourceSha: '471b0452324f0e3963f465e3fa9a2f526cd679a5',
    componentsVersion: manifest.version,
    domPurifyVersion: DOMPurify.version,
    domPurifyRuntimeLoaded: true,
  };
};
```

Inspect archive contents with `tar -tzf`. Checksums and provenance are recorded in
`archive.json`; the exact client tarball is also integrity-pinned in package-lock.
All extra exports and the CLI flag are pilot-only and must never be released.

## Acceptance

Use the isolated approved-PR Internal Check at the exact final CLI head, with
`updateSnapshots=false` and `skipTests=false`. Require proof from the packaged
binary, successful integration and full documentation checks, and no automatic
snapshot acceptance. Do not merge components #795 before that result.

No npm publication, schedules, mass distribution or auto-merge are authorized.
Close this temporary PR without merge when its source is no longer needed.
