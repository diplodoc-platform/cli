# Published CLI verification

After a successful stable `npm publish`, Release dispatches `Verify published CLI`
on the default branch with the exact version. Prerelease, deprecation and failed
publication never dispatch it. Release does not wait for verification to finish.
The CLI release workflow is excluded from infra distribution in `.infrarc.yml`;
shared release-template changes must be incorporated when updating it.

The check runs on Ubuntu / Node.js 24 without checkout, build or tests. It installs
from public npm in a fresh directory, retries installation at most three times,
and runs the installed `yfm --version`. Its timeout is ten minutes.
Use **Actions → Verify published CLI → Run workflow** on the default branch to
recheck an exact stable version without publishing again.

No issues, chat credentials or PAT are used. The existing signed docs-api webhook
handles `workflow_run.completed` failures for this workflow and starts a short
Temporal workflow on the Messenger bot queue. It sends the version and run link
to the existing team chat. Success and cancellation are silent.

Rollout: deploy the bot workflow, deploy docs-api, and add `workflow_run` to the
existing docs-api GitHub webhook's event subscription (preserving its other events).
Then merge this change. No webhook settings are changed by the CLI workflow.
