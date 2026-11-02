# Published CLI verification

`Verify published CLI` runs independently after `Release Package to npm` succeeds.
It checks only stable CLI publications, including manually dispatched stable releases.
It does not block Release or the release train, rebuild the CLI, or rerun its test suite.

The verifier reads `package.json` at the publishing run's exact commit, after confirming
that its `Publish stable to npm` step succeeded in that run attempt. Prereleases and
deprecation runs are skipped. Keep that step name in sync if the shared Release template
changes. No changes to the shared template are required for this workflow.

On Ubuntu with Node.js 24, the verifier installs the exact version from public npm in
a fresh temporary consumer project and executes its installed `yfm --version` binary.
It uses an isolated npm configuration and cache, keeps install lifecycle scripts enabled,
and receives no publishing credentials. Transient registry errors are retried up to three
times; dependency conflicts and CLI startup failures are not retried. The job has a
12-minute timeout.

## Failure and recovery

A separate job uses the built-in `GITHUB_TOKEN` with `issues: write` to create one issue
per failed version. No PAT, chat token, repository secret, or manual label setup is needed.
The issue links to the verification log and, for automatic checks, the publishing run.
Repeated failures update the same issue without adding comments. A successful check of
the same version closes it; another failure reopens it. Successful checks without an
existing issue are silent. An older result cannot overwrite a newer recorded check.

Open **Actions → Verify published CLI → Run workflow** on the default branch and enter
an exact stable version, such as `5.64.1`, to recheck without publishing again. Re-running
the original verifier workflow also works. A successful check of a different version
does not close the issue for a broken version. Inspect the logs before treating a failure
as a package defect: registry outages and runner failures can also fail verification.

The existing internal issues digest polls GitHub and includes `github-actions[bot]`
issues. It delivers newly created issues on its regular schedule, not immediately.
Updates, reopens and closes of existing issues are not new-issue notifications.
No additional chat integration is configured by this workflow.

The workflow must be merged into the default branch before `workflow_run` can trigger it.
It intentionally does not create package-failure issues when it cannot resolve a version;
such API/setup failures remain visible as a failed Actions run. The issue-reporting job's
own failures also remain visible in Actions.

## Tests

The helper tests are included in the existing unit suite. To run just these tests:

```sh
npm test -- scripts/npm-release.spec.mjs
```
