# Published CLI verification

`Verify published CLI` listens for successful completion of `Release Package to
npm` through `workflow_run`. It supports both GitHub releases and manual stable
publication, without changing the shared release workflow.

For a GitHub release, the version comes from its tag; drafts and prereleases are
ignored. For manual stable publication, the check requires a successful `Publish
stable to npm` step in the exact source run attempt and reads `package.json` at
that run's commit SHA. It never uses the current branch head or npm `latest`.
The existing Release run names exclude `Prerelease: ...` and `Deprecate: ...`
without allocating a runner. The step-result check also rejects older manual runs
whose names did not distinguish release types. Keep the source workflow/job/step
names in sync if the common release template renames them.

The check runs on Ubuntu / Node.js 24 without checkout, build or tests. A successful
`npm publish` can precede public availability while npm performs its
[publish-time scan](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/).
The check polls the exact version in public npm every 30 seconds for up to
20 minutes, forcing metadata revalidation. Each registry request has a ten-second
timeout and no internal retries. A version that remains unavailable fails the job
with a separate availability error.

Once available, it installs from public npm in a fresh directory, retries
installation at most three times, and runs the installed `yfm --version`.
Installation and startup errors still fail the job. The overall timeout is
30 minutes. Use **Re-run jobs** on an existing verification run to check that
publication again; do not rerun publication to address a scan delay.

The existing signed docs-api webhook already receives `check_run` events. Only a
failed or timed-out GitHub Actions job named `Verify published CLI installation`
on the default branch starts the short Temporal alert workflow. The existing
Messenger bot posts a link to that exact job; the installed version is in its log.
Other check events are ignored without starting Temporal or posting to the chat.

No new webhook subscriptions, issues, cron, chat credentials or PAT are needed.
Deploy the bot and docs-api before merging this change. Webhook settings stay as
currently configured (`pull_request` and `check_run`); do not add `workflow_run`.
The `workflow_run` trigger above is internal to GitHub Actions and does not require
an external webhook subscription.
