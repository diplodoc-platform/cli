# Fork PR check smoke test

This temporary draft PR verifies that CLI checks can fetch the head commit of a PR
from a fork and validate its exact SHA.

The change only adds this document. It does not change CLI code, dependencies,
build scripts, or GitHub workflows.

Keep this PR unmerged. Close it after the smoke test is complete.

Repeat the fork check after the Temporal and docs-api fixes deployed on 2026-10-09.
This documentation update supplies a new head SHA for the smoke test.

Repeat the smoke after merging the numeric Sandbox resource TTL fix (PR 16320380).
