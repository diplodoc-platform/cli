# Published CLI verification

`Verify published CLI` listens for completion of `Release Package to npm` through
`workflow_run`. Its job runs only when the source workflow succeeded and was
triggered by a GitHub `release` event. The shared release workflow is unchanged.
Manual runs (including prerelease, deprecation and manual stable publication) are
ignored without allocating a runner; GitHub may show a skipped verification run.

The exact version comes from the source run's release tag. The check reads the
GitHub release and skips drafts, prereleases and tags without a stable version.
The existing Release workflow validates that the package version matches its tag
before publishing to npm.

The check runs on Ubuntu / Node.js 24 without checkout, build or tests. It installs
from public npm in a fresh directory, retries installation at most three times,
and runs the installed `yfm --version`. Its timeout is ten minutes. Use **Re-run
jobs** on an existing verification run to check that release again.

No issues, chat credentials or PAT are used. The existing signed docs-api webhook
handles `workflow_run.completed` failures for this workflow and starts a short
Temporal workflow on the Messenger bot queue. It sends the version and run link
to the existing team chat. Success and cancellation are silent.

Rollout: deploy the bot workflow, deploy docs-api, and add `workflow_run` to the
existing docs-api GitHub webhook's event subscription (preserving its other events).
Then merge this change. No webhook settings are changed by the CLI workflow.
